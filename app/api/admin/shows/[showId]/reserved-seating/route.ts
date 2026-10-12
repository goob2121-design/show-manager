import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { getReservedSeatDefinition } from "@/lib/reserved-seating";
import { normalizeReservedSeatPayAtDoorQuantity } from "@/lib/reserved-seat-pay-at-door";
import { tryGenerateReservationScanToken } from "@/lib/reservation-scan-tokens";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { syncReservedSeatingLinksForImportedOrders } from "@/lib/ticket-ingestion";
import type { ReservedSeatCategory, ShowCompTicket } from "@/lib/types";

export const runtime = "nodejs";
type Context = { params: Promise<{ showId: string }> };
const categories = new Set<ReservedSeatCategory>(["paid_reserved", "comp", "guest"]);

async function authorize(showId: string, slug: string) {
  const store = await cookies();
  if (!slug || !verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value)) return null;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from("shows").select("id").eq("id", showId).eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data ? supabase : null;
}

export async function GET(request: Request, context: Context) {
  try {
    const { showId } = await context.params;
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    const supabase = await authorize(showId, slug);
    if (!supabase) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    const [linksResult, assignmentsResult] = await Promise.all([
      supabase.from("show_reserved_seating_links").select("*").eq("show_id", showId).order("created_at", { ascending: false }),
      supabase.from("show_reserved_seat_assignments").select("*").eq("show_id", showId).order("created_at", { ascending: true }),
    ]);
    if (linksResult.error) throw linksResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    return NextResponse.json({ success: true, links: linksResult.data ?? [], assignments: assignmentsResult.data ?? [] });
  } catch (error) {
    console.error("Reserved seating admin load failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to load reserved seating." }, { status: 500 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { showId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const action = typeof body.action === "string" ? body.action : "";
    const supabase = await authorize(showId, slug);
    if (!supabase) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });

    if (action === "sync-imported") {
      const ticketIds = Array.isArray(body.ticketIds) ? body.ticketIds.filter((id): id is string => typeof id === "string") : [];
      const { data, error } = await supabase.from("show_comp_tickets").select("*").eq("show_id", showId).eq("ticket_type", "paid_online").in("id", ticketIds);
      if (error) throw error;
      const result = await syncReservedSeatingLinksForImportedOrders(supabase, showId, (data ?? []) as ShowCompTicket[]);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "upsert-comp-link") {
      const linkId = typeof body.linkId === "string" ? body.linkId : "";
      const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
      const seatCategory = body.seatCategory === "guest" ? "guest" : "comp";
      const values = {
        customer_name: customerName,
        ticket_count: Math.max(1, Math.floor(Number(body.ticketCount) || 1)),
        is_complimentary: true,
        source_ticket_id: typeof body.sourceTicketId === "string" ? body.sourceTicketId : null,
        source_show_sponsor_id: typeof body.sourceShowSponsorId === "string" ? body.sourceShowSponsorId : null,
        source_note: typeof body.sourceNote === "string" ? body.sourceNote : null,
        seat_category: seatCategory,
        child_seat_limit: 0,
      };
      const query = linkId
        ? supabase.from("show_reserved_seating_links").update(values).eq("id", linkId).eq("show_id", showId).select("id").single()
        : supabase.from("show_reserved_seating_links").insert({ ...values, show_id: showId, email: null, scan_token: tryGenerateReservationScanToken(), selection_mode: "comp" }).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id });
    }

    if (action === "update-comp-identity") {
      const assignmentIds = Array.isArray(body.assignmentIds) ? body.assignmentIds.filter((id): id is string => typeof id === "string") : [];
      const linkIds = Array.isArray(body.linkIds) ? body.linkIds.filter((id): id is string => typeof id === "string") : [];
      const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
      const seatCategory = body.seatCategory === "guest" ? "guest" : "comp";
      if (assignmentIds.length) {
        const { error } = await supabase.from("show_reserved_seat_assignments").update({ customer_name: customerName, seat_category: seatCategory }).eq("show_id", showId).in("id", assignmentIds);
        if (error) throw error;
      }
      if (linkIds.length) {
        const { error } = await supabase.from("show_reserved_seating_links").update({ customer_name: customerName, source_note: typeof body.sourceNote === "string" ? body.sourceNote : null, seat_category: seatCategory, is_complimentary: true }).eq("show_id", showId).in("id", linkIds);
        if (error) throw error;
      }
      return NextResponse.json({ success: true });
    }

    if (action === "create-link") {
      const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim() || null : null;
      const sourceNote = typeof body.sourceNote === "string" ? body.sourceNote.trim() || null : null;
      const isComplimentary = body.isComplimentary === true;
      const seatCategory = categories.has(body.seatCategory as ReservedSeatCategory) ? body.seatCategory as ReservedSeatCategory : null;
      const ticketCount = normalizeReservedSeatPayAtDoorQuantity(String(body.ticketCount ?? ""));
      if (!customerName || !seatCategory) return NextResponse.json({ success: false, error: "A customer and valid seat category are required." }, { status: 400 });
      const { data, error } = await supabase.from("show_reserved_seating_links").insert({
        show_id: showId, customer_name: customerName, email, ticket_count: ticketCount,
        scan_token: tryGenerateReservationScanToken(), selection_mode: isComplimentary ? "comp" : "customer",
        is_complimentary: isComplimentary, source_note: sourceNote, seat_category: seatCategory,
        child_seat_limit: 0,
        pay_at_door_intent: !isComplimentary && seatCategory === "paid_reserved" && body.payAtDoor === true,
      }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id });
    }

    const linkId = typeof body.linkId === "string" ? body.linkId : "";
    if (action === "mark-sent") {
      const { error } = await supabase.from("show_reserved_seating_links").update({ sent_at: new Date().toISOString() }).eq("id", linkId).eq("show_id", showId).is("sent_at", null);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    const seatId = typeof body.seatId === "string" ? body.seatId.trim() : "";
    const definition = getReservedSeatDefinition(seatId);
    if (action === "assign-seat") {
      const { data: link, error: linkError } = await supabase.from("show_reserved_seating_links").select("id,customer_name,email,ticket_count,selection_mode,is_complimentary,seat_category,sent_at").eq("id", linkId).eq("show_id", showId).maybeSingle();
      if (linkError) throw linkError;
      if (!link || !definition) return NextResponse.json({ success: false, error: "Reservation or seat not found." }, { status: 404 });
      const { count, error: countError } = await supabase.from("show_reserved_seat_assignments").select("id", { count: "exact", head: true }).eq("seating_link_id", link.id).eq("assignment_type", "customer");
      if (countError) throw countError;
      if ((count ?? 0) >= link.ticket_count) return NextResponse.json({ success: false, error: "This reservation already has all purchased seats assigned." }, { status: 409 });
      const now = new Date().toISOString();
      const { error } = await supabase.from("show_reserved_seat_assignments").insert({
        show_id: showId, seating_link_id: link.id, customer_name: link.customer_name, email: link.email,
        seat_id: seatId, section: definition.section, row_label: definition.rowLabel, seat_number: definition.seatNumber,
        assignment_type: "customer", seat_category: link.seat_category, occupant_type: "ticketed",
      });
      if (error) return NextResponse.json({ success: false, error: error.code === "23505" ? "That seat is no longer available." : error.message }, { status: error.code === "23505" ? 409 : 400 });
      const { error: updateError } = await supabase.from("show_reserved_seating_links").update({ selection_mode: link.is_complimentary ? "comp" : "manual", submitted_at: now, sent_at: link.sent_at ?? now }).eq("id", link.id).eq("show_id", showId);
      if (updateError) throw updateError;
      return NextResponse.json({ success: true });
    }

    if (action === "block-seat") {
      if (!definition) return NextResponse.json({ success: false, error: "Seat not found." }, { status: 404 });
      const { error } = await supabase.from("show_reserved_seat_assignments").insert({ show_id: showId, seat_id: seatId, section: definition.section, row_label: definition.rowLabel, seat_number: definition.seatNumber, assignment_type: "blocked", occupant_type: "ticketed" });
      if (error) return NextResponse.json({ success: false, error: error.code === "23505" ? "That seat is no longer available." : error.message }, { status: error.code === "23505" ? 409 : 400 });
      return NextResponse.json({ success: true });
    }

    if (action === "clear-assignment") {
      const assignmentId = typeof body.assignmentId === "string" ? body.assignmentId : "";
      const { error } = await supabase.from("show_reserved_seat_assignments").delete().eq("id", assignmentId).eq("show_id", showId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "update-category") {
      const seatCategory = categories.has(body.seatCategory as ReservedSeatCategory) ? body.seatCategory as ReservedSeatCategory : null;
      if (!linkId || !seatCategory) return NextResponse.json({ success: false, error: "A valid reservation and category are required." }, { status: 400 });
      const { error: linkError } = await supabase.from("show_reserved_seating_links").update({ seat_category: seatCategory }).eq("id", linkId).eq("show_id", showId);
      if (linkError) throw linkError;
      const { error: assignmentError } = await supabase.from("show_reserved_seat_assignments").update({ seat_category: seatCategory }).eq("show_id", showId).eq("seating_link_id", linkId).eq("assignment_type", "customer");
      if (assignmentError) throw assignmentError;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Unsupported reserved seating action." }, { status: 400 });
  } catch (error) {
    console.error("Reserved seating admin mutation failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to update reserved seating." }, { status: 500 });
  }
}

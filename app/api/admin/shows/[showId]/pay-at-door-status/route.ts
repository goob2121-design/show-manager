import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName } from "@/lib/admin-session";
import { resolveDoorAccess } from "@/lib/door-access";
import { getDoorStaffSessionCookieName } from "@/lib/door-staff-session";

export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Pay at Door status is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request, context: { params: Promise<{ showId: string }> }) {
  try {
    const { showId } = await context.params;
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    const cookieStore = await cookies();
    const role = resolveDoorAccess({
      slug, showId,
      adminCookieValue: cookieStore.get(getAdminSessionCookieName(slug))?.value,
      doorStaffCookieValue: cookieStore.get(getDoorStaffSessionCookieName(slug))?.value,
    });
    if (!role) return NextResponse.json({ success: false, error: "Door Mode access is required." }, { status: 401 });

    const supabase = serviceClient();
    const [{ data: links, error: linkError }, { data: projections, error: projectionError }] = await Promise.all([
      supabase.from("show_reserved_seating_links").select("id, source_ticket_id").eq("show_id", showId).eq("pay_at_door_intent", true),
      supabase.from("show_admission_projection_sources").select("source_id, projected_ticket_id").eq("show_id", showId).eq("source_type", "reserved_link"),
    ]);
    if (linkError) throw linkError;
    if (projectionError) throw projectionError;
    const ticketIdByLinkId = new Map<string, string>();
    ((links ?? []) as Array<{ id: string; source_ticket_id: string | null }>).forEach((link) => { if (link.source_ticket_id) ticketIdByLinkId.set(link.id, link.source_ticket_id); });
    ((projections ?? []) as Array<{ source_id: string; projected_ticket_id: string }>).forEach((row) => ticketIdByLinkId.set(row.source_id, row.projected_ticket_id));
    const ticketIds = [...new Set(ticketIdByLinkId.values())];
    const { data: tickets, error: ticketError } = ticketIds.length
      ? await supabase.from("show_comp_tickets").select("id, pay_at_door_amount, pay_at_door_paid_at, pay_at_door_payment_method").in("id", ticketIds)
      : { data: [], error: null };
    if (ticketError) throw ticketError;
    const byTicket = new Map(((tickets ?? []) as Array<{ id: string; pay_at_door_amount: number | null; pay_at_door_paid_at: string | null; pay_at_door_payment_method: string | null }>).map((ticket) => [ticket.id, ticket]));
    return NextResponse.json({ success: true, statuses: [...ticketIdByLinkId].flatMap(([linkId, ticketId]) => {
      const ticket = byTicket.get(ticketId);
      return ticket ? [{ linkId, amount: ticket.pay_at_door_amount, paidAt: ticket.pay_at_door_paid_at, method: ticket.pay_at_door_payment_method }] : [];
    }) });
  } catch (error) {
    console.error("Pay at Door status failed.", error);
    return NextResponse.json({ success: false, error: "Unable to load Pay at Door status." }, { status: 500 });
  }
}

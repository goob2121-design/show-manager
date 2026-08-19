import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { deliverReservedSeatReminder } from "@/lib/email/reserved-seat-reminder-delivery";
import { isReservedSeatBulkOperationId } from "@/lib/reserved-seat-reminder-eligibility";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ showId: string }> };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Reserved-seat reminders are not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function value(input: unknown) {
  return typeof input === "string" ? input.trim() : "";
}

function validOperationId(input: string) {
  return /^[A-Za-z0-9_-]{8,200}$/.test(input);
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { showId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const slug = value(body.slug);
    const action = value(body.action);
    if (!slug || !["single", "bulk"].includes(action)) return NextResponse.json({ success: false, error: "A valid show and reminder action are required." }, { status: 400 });

    const cookieStore = await cookies();
    if (!verifyAdminSessionCookieValue(slug, cookieStore.get(getAdminSessionCookieName(slug))?.value)) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });

    const supabase = serviceClient();
    const { data: show, error: showError } = await supabase.from("shows").select("id,slug").eq("id", showId).eq("slug", slug).maybeSingle();
    if (showError) throw showError;
    if (!show) return NextResponse.json({ success: false, error: "Show was not found." }, { status: 404 });

    if (action === "single") {
      const reservationId = value(body.reservationId);
      const requestId = value(body.requestId);
      if (!reservationId || !validOperationId(requestId)) return NextResponse.json({ success: false, error: "Reservation ID and request UUID are required." }, { status: 400 });
      const result = await deliverReservedSeatReminder({ supabase, showId, reservationId, requestId, requestedSource: "admin_single" });
      const ok = result.outcome === "sent" || result.outcome === "already_processed";
      return NextResponse.json({ success: ok, result, error: ok ? null : result.error ?? result.reason }, { status: ok ? 200 : result.outcome === "not_eligible" ? 409 : 502 });
    }

    const bulkOperationId = value(body.bulkOperationId);
    if (!isReservedSeatBulkOperationId(bulkOperationId)) return NextResponse.json({ success: false, error: "A bulk operation UUID is required." }, { status: 400 });
    const { data: reservations, error: reservationsError } = await supabase.from("show_reserved_seating_links").select("id").eq("show_id", showId).order("created_at", { ascending: true });
    if (reservationsError) throw reservationsError;

    const results = [];
    for (const reservation of reservations ?? []) {
      try {
        results.push(await deliverReservedSeatReminder({ supabase, showId, reservationId: reservation.id, requestId: `bulk-${bulkOperationId}-${reservation.id}`, requestedSource: "admin_bulk", bulkOperationId }));
      } catch (error) {
        console.error("Reserved-seat bulk reminder recipient failed.", {
          reservationId: reservation.id,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        results.push({
          reservationId: reservation.id,
          outcome: "failed" as const,
          reason: null,
          deliveryId: null,
          sequenceNumber: null,
          resendEmailId: null,
          error: "Unable to process this reminder.",
        });
      }
    }
    const summary = results.reduce((counts, result) => {
      const key = result.outcome === "not_eligible" ? result.reason ?? "not_eligible" : result.outcome;
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    return NextResponse.json({ success: true, bulkOperationId, summary, results });
  } catch (error) {
    console.error("Reserved-seat reminder route failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to process reserved-seat reminders." }, { status: 500 });
  }
}

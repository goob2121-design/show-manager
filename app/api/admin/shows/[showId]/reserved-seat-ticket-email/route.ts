import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName } from "@/lib/admin-session";
import { deliverOfficialTicketEmail } from "@/lib/email/official-ticket-email";
import { validateReservedSeatEmailStatusAccess } from "@/lib/reserved-seat-email-status-auth";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ showId: string }> };

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Official ticket email delivery is not configured.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { showId } = await context.params;
    const body = await request.json() as { slug?: unknown; reservationId?: unknown };
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const reservationId = typeof body.reservationId === "string" ? body.reservationId.trim() : "";
    if (!reservationId) return NextResponse.json({ success: false, error: "Reservation ID is required." }, { status: 400 });

    const supabase = createServiceRoleSupabaseClient();
    const { data: show, error: showError } = await supabase.from("shows").select("id,slug").eq("id", showId).maybeSingle();
    if (showError) throw showError;
    const cookieStore = await cookies();
    const access = validateReservedSeatEmailStatusAccess({
      requestedShowId: showId,
      requestedSlug: slug,
      canonicalShow: show ? { id: show.id, slug: show.slug } : null,
      cookieValue: show?.slug ? cookieStore.get(getAdminSessionCookieName(show.slug))?.value : undefined,
    });
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const { data: reservation, error: reservationError } = await supabase
      .from("show_reserved_seating_links")
      .select("id")
      .eq("id", reservationId)
      .eq("show_id", access.showId)
      .maybeSingle();
    if (reservationError) throw reservationError;
    if (!reservation) return NextResponse.json({ success: false, error: "Reservation was not found." }, { status: 404 });

    const result = await deliverOfficialTicketEmail(supabase, reservation.id, { requestOrigin: request.nextUrl.origin });
    if (!result.success) return NextResponse.json({ success: false, error: result.error || "Ticket email delivery failed." }, { status: 502 });
    return NextResponse.json({ success: true, message: "Official ticket email resent." });
  } catch (error) {
    console.error("Admin official ticket resend failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to resend the official ticket email." }, { status: 500 });
  }
}
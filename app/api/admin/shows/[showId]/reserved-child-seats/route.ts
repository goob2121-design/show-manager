import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";

export const runtime = "nodejs";

type Context = { params: Promise<{ showId: string }> };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Reserved child-seat administration is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request, context: Context) {
  try {
    const { showId } = await context.params;
    const body = await request.json() as { slug?: unknown; reservationId?: unknown; childSeatLimit?: unknown; action?: unknown };
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const reservationId = typeof body.reservationId === "string" ? body.reservationId.trim() : "";
    const action = body.action === "reset" || body.action === "delete" ? body.action : "set-limit";
    const childSeatLimit = typeof body.childSeatLimit === "number" ? Math.floor(body.childSeatLimit) : Number.NaN;
    const cookieStore = await cookies();
    if (!slug || !verifyAdminSessionCookieValue(slug, cookieStore.get(getAdminSessionCookieName(slug))?.value)) {
      return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    }
    if (!showId || !reservationId || (action === "set-limit" && (!Number.isInteger(childSeatLimit) || childSeatLimit < 0 || childSeatLimit > 50))) {
      return NextResponse.json({ success: false, error: "A valid reservation and child-seat limit are required." }, { status: 400 });
    }

    const supabase = serviceClient();
    const { data: show, error: showError } = await supabase.from("shows").select("id,slug").eq("id", showId).eq("slug", slug).maybeSingle();
    if (showError) throw showError;
    if (!show) return NextResponse.json({ success: false, error: "Show not found." }, { status: 404 });

    if (action === "reset" || action === "delete") {
      const functionName = action === "reset" ? "admin_reset_reserved_family_seats" : "admin_delete_reserved_family_link";
      const { data: result, error: mutationError } = await supabase.rpc(functionName, { p_show_id: showId, p_reservation_id: reservationId });
      if (mutationError) throw mutationError;
      if (result === "NOT_FOUND") return NextResponse.json({ success: false, error: "Reservation not found." }, { status: 404 });
      return NextResponse.json({ success: true, resultStatus: result });
    }

    const { data, error } = await supabase.rpc("set_reserved_child_seat_limit", {
      p_show_id: showId,
      p_reservation_id: reservationId,
      p_child_seat_limit: childSeatLimit,
    });
    if (error) throw error;
    const row = (data as Array<Record<string, unknown>> | null)?.[0];
    const status = String(row?.result_status ?? "UNKNOWN");
    if (status !== "UPDATED") {
      const message = status === "BELOW_CURRENT_USAGE"
        ? "The approved limit cannot be lower than the family's current child seats or check-ins."
        : status === "NOT_ELIGIBLE"
          ? "Only paid reserved admissions can receive free child seats."
          : "Reservation not found.";
      return NextResponse.json({ success: false, error: message, resultStatus: status }, { status: 400 });
    }
    return NextResponse.json({ success: true, childSeatLimit: Number(row?.child_seat_limit ?? childSeatLimit) });
  } catch (error) {
    console.error("Reserved child-seat admin update failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to update the child-seat approval." }, { status: 500 });
  }
}

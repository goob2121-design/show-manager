import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName } from "@/lib/admin-session";
import { resolveDoorAccess } from "@/lib/door-access";
import { getDoorStaffSessionCookieName } from "@/lib/door-staff-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ showId: string }> };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Reserved family check-in is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request, context: Context) {
  try {
    const { showId } = await context.params;
    const body = await request.json() as { slug?: unknown; reservationId?: unknown; adultDelta?: unknown; childDelta?: unknown };
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const reservationId = typeof body.reservationId === "string" ? body.reservationId.trim() : "";
    const adultDelta = typeof body.adultDelta === "number" ? Math.trunc(body.adultDelta) : Number.NaN;
    const childDelta = typeof body.childDelta === "number" ? Math.trunc(body.childDelta) : Number.NaN;
    const cookieStore = await cookies();
    const access = resolveDoorAccess({
      slug,
      showId,
      adminCookieValue: cookieStore.get(getAdminSessionCookieName(slug))?.value,
      doorStaffCookieValue: cookieStore.get(getDoorStaffSessionCookieName(slug))?.value,
    });
    if (!access) return NextResponse.json({ success: false, error: "Door Mode access is required." }, { status: 401 });
    if (!reservationId || !Number.isInteger(adultDelta) || !Number.isInteger(childDelta)) {
      return NextResponse.json({ success: false, error: "Valid family check-in adjustments are required." }, { status: 400 });
    }

    const { data, error } = await serviceClient().rpc("adjust_reserved_family_check_in", {
      p_show_id: showId,
      p_reservation_id: reservationId,
      p_adult_delta: adultDelta,
      p_child_delta: childDelta,
    });
    if (error) throw error;
    const row = (data as Array<Record<string, unknown>> | null)?.[0];
    const status = String(row?.result_status ?? "UNKNOWN");
    if (status !== "UPDATED") {
      return NextResponse.json({ success: false, error: status === "OUT_OF_RANGE" ? "Check-in cannot exceed this family's valid admissions." : "Unable to find this family's admission.", resultStatus: status }, { status: 409 });
    }
    return NextResponse.json({ success: true, result: {
      resultStatus: status,
      ticketId: row?.ticket_id,
      adultCheckedIn: Number(row?.adult_checked_in ?? 0),
      adultTotal: Number(row?.adult_total ?? 0),
      childCheckedIn: Number(row?.child_checked_in ?? 0),
      childTotal: Number(row?.child_total ?? 0),
    } });
  } catch (error) {
    console.error("Reserved family check-in failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to update this family's check-in." }, { status: 500 });
  }
}

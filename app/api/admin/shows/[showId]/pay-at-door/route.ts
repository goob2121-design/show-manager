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
  if (!url || !key) throw new Error("Pay at Door is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request, context: { params: Promise<{ showId: string }> }) {
  try {
    const { showId } = await context.params;
    const body = await request.json().catch(() => null) as { slug?: string; ticketId?: string; method?: string } | null;
    const slug = body?.slug?.trim() ?? "";
    const ticketId = body?.ticketId?.trim() ?? "";
    const method = body?.method === "cash" || body?.method === "external_card" ? body.method : null;
    if (!showId || !slug || !ticketId || !method) return NextResponse.json({ success: false, error: "Show, admission, and payment method are required." }, { status: 400 });

    const cookieStore = await cookies();
    const role = resolveDoorAccess({
      slug,
      showId,
      adminCookieValue: cookieStore.get(getAdminSessionCookieName(slug))?.value,
      doorStaffCookieValue: cookieStore.get(getDoorStaffSessionCookieName(slug))?.value,
    });
    if (!role) return NextResponse.json({ success: false, error: "Door Mode access is required." }, { status: 401 });

    const { data, error } = await serviceClient().rpc("complete_reserved_seat_pay_at_door", {
      p_show_id: showId,
      p_show_slug: slug,
      p_ticket_id: ticketId,
      p_payment_method: method,
      p_handled_by: role,
    });
    if (error) throw error;
    const row = (data as Array<Record<string, unknown>> | null)?.[0];
    if (!row) throw new Error("Pay at Door returned no result.");
    return NextResponse.json({ success: true, result: {
      resultStatus: row.result_status,
      ticketId: row.ticket_id,
      amount: row.amount,
      paymentMethod: row.payment_method,
      paidAt: row.paid_at,
      checkedInCount: row.checked_in_count,
      ticketCount: row.ticket_count,
    } });
  } catch (error) {
    console.error("Reserved Seat Pay at Door failed.", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to complete Pay at Door." }, { status: 500 });
  }
}

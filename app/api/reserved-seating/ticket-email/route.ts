import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deliverOfficialTicketEmail } from "@/lib/email/official-ticket-email";

export const runtime = "nodejs";

const CUSTOMER_RESEND_COOLDOWN_MS = 60_000;
const resendAttempts = new Map<string, number>();

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Official ticket email delivery is not configured.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) return NextResponse.json({ success: false, error: "Reservation token is required." }, { status: 400 });

    const supabase = createServiceRoleSupabaseClient();
    const { data: link, error } = await supabase
      .from("show_reserved_seating_links")
      .select("id,submitted_at")
      .eq("selection_token", token)
      .maybeSingle();
    if (error) throw error;
    if (!link) return NextResponse.json({ success: false, error: "Reservation was not found." }, { status: 404 });
    if (!link.submitted_at) return NextResponse.json({ success: false, error: "Confirm your seats before requesting tickets." }, { status: 409 });

    const now = Date.now();
    const lastAttempt = resendAttempts.get(link.id) ?? 0;
    const remainingMs = CUSTOMER_RESEND_COOLDOWN_MS - (now - lastAttempt);
    if (remainingMs > 0) {
      return NextResponse.json(
        { success: false, error: `Please wait ${Math.ceil(remainingMs / 1000)} seconds before sending again.`, retryAfterSeconds: Math.ceil(remainingMs / 1000) },
        { status: 429, headers: { "Retry-After": String(Math.ceil(remainingMs / 1000)) } },
      );
    }
    resendAttempts.set(link.id, now);

    const result = await deliverOfficialTicketEmail(supabase, link.id, { requestOrigin: request.nextUrl.origin });
    if (!result.success) {
      return NextResponse.json({ success: false, error: "Your ticket email could not be delivered. Please try again later." }, { status: 502 });
    }
    return NextResponse.json({ success: true, message: "Your official ticket email has been sent again." });
  } catch (error) {
    console.error("Customer official ticket resend failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to resend your ticket email right now." }, { status: 500 });
  }
}
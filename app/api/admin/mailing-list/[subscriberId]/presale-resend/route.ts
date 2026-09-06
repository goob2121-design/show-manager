import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { resendMailingListPresaleAccess } from "@/lib/mailing-list-presale-resend";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Mailing list is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function authorized(slug: string) {
  const store = await cookies();
  return Boolean(slug && verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value));
}
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

export async function POST(request: NextRequest, context: { params: Promise<{ subscriberId: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    if (!(await authorized(slug))) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    const { subscriberId } = await context.params;
    const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId.trim() : "";
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (![subscriberId, deliveryId, requestId].every(validUuid)) return NextResponse.json({ success: false, error: "Valid subscriber, delivery, and request IDs are required." }, { status: 400 });
    const reason = typeof body.reason === "string" ? body.reason : null;
    const result = await resendMailingListPresaleAccess({ supabase: db(), subscriberId, deliveryId, requestId, reason, apiKey: process.env.RESEND_API_KEY });
    return NextResponse.json({ success: result.status === "sent" || result.status === "duplicate", ...result }, { status: result.httpStatus });
  } catch (error) {
    console.error("Mailing-list presale resend failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to resend presale access." }, { status: 500 });
  }
}

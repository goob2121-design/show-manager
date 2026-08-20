import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";

export const runtime = "nodejs";

const SELECT = "id,code,label,offer_text,ticket_url,status,expires_at,notes,created_at,updated_at";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Saved discount codes are not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}
function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function validDate(value: string) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}
async function authorized(slug: string) {
  const store = await cookies();
  return Boolean(slug && verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value));
}

export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get("slug")?.trim() ?? "";
    if (!(await authorized(slug))) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    const { data, error } = await serviceClient().from("email_discount_codes").select(SELECT)
      .order("status", { ascending: true }).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, codes: data ?? [] });
  } catch (error) {
    console.error("Saved discount code lookup failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to load saved discount codes." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json() as unknown;
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const slug = text(body.slug, 200);
    if (!(await authorized(slug))) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    const action = text(body.action, 20);
    const id = text(body.id, 36);
    const code = text(body.code, 100);
    const label = text(body.label, 200);
    const offerText = text(body.offerText, 500);
    const ticketUrl = text(body.ticketUrl, 2000);
    const expiresAt = text(body.expiresAt, 10);
    const notes = text(body.notes, 2000);
    const status = text(body.status, 20);
    if (!["create", "update"].includes(action)) return NextResponse.json({ success: false, error: "Invalid action." }, { status: 400 });
    if (action === "update" && !validUuid(id)) return NextResponse.json({ success: false, error: "Invalid saved code." }, { status: 400 });
    if (!code) return NextResponse.json({ success: false, error: "Enter a discount code." }, { status: 400 });
    if (!offerText) return NextResponse.json({ success: false, error: "Enter offer text." }, { status: 400 });
    if (ticketUrl && !/^https:\/\//i.test(ticketUrl)) return NextResponse.json({ success: false, error: "Ticket URL must use HTTPS." }, { status: 400 });
    if (!validDate(expiresAt)) return NextResponse.json({ success: false, error: "Enter a valid expiration date." }, { status: 400 });
    if (!["active", "inactive"].includes(status)) return NextResponse.json({ success: false, error: "Select a valid status." }, { status: 400 });
    const values = { code, label: label || null, offer_text: offerText, ticket_url: ticketUrl || null,
      expires_at: expiresAt || null, notes: notes || null, status, updated_at: new Date().toISOString() };
    const supabase = serviceClient();
    const query = action === "create"
      ? supabase.from("email_discount_codes").insert(values)
      : supabase.from("email_discount_codes").update(values).eq("id", id);
    const { data, error } = await query.select(SELECT).single();
    if (error?.code === "23505") return NextResponse.json({ success: false, error: "That discount code is already saved." }, { status: 409 });
    if (error) throw error;
    return NextResponse.json({ success: true, code: data });
  } catch (error) {
    console.error("Saved discount code update failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to save this discount code." }, { status: 500 });
  }
}

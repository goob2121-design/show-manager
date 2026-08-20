import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { cleanMailingListName, isValidMailingListEmail, isMailingListSource, normalizeMailingListEmail } from "@/lib/mailing-list";

function db() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE; if (!url || !key) throw new Error("Mailing list is not configured."); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }
async function authorized(slug: string) { const store = await cookies(); return slug && verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value); }
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim() ?? ""; if (!(await authorized(slug))) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
  const { data, error } = await db().from("mailing_list_subscribers").select("id,email,first_name,last_name,status,source,subscribed_at,unsubscribed_at,created_at,updated_at").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ success: false, error: "Unable to load subscribers." }, { status: 500 });
  return NextResponse.json({ success: true, subscribers: data ?? [] });
}
export async function POST(request: NextRequest) {
  const raw = await request.json() as Record<string, unknown>; const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
  if (!(await authorized(slug))) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
  const action = typeof raw.action === "string" ? raw.action : ""; const supabase = db(); const now = new Date().toISOString();
  if (action === "add") {
    const email = normalizeMailingListEmail(typeof raw.email === "string" ? raw.email : ""); if (!isValidMailingListEmail(email)) return NextResponse.json({ success: false, error: "Enter a valid email." }, { status: 400 });
    const source = typeof raw.source === "string" && isMailingListSource(raw.source) ? raw.source : "admin";
    const { data: existing } = await supabase.from("mailing_list_subscribers").select("id,status").ilike("email", email).maybeSingle();
    if (existing?.status === "unsubscribed") return NextResponse.json({ success: false, error: "This subscriber is unsubscribed. Use Reactivate to explicitly restore them." }, { status: 409 });
    if (existing) return NextResponse.json({ success: true, status: "already_subscribed" });
    const { error } = await supabase.from("mailing_list_subscribers").insert({ email, first_name: cleanMailingListName(raw.firstName) || null, last_name: cleanMailingListName(raw.lastName) || null, source }); if (error) throw error;
  } else if (["unsubscribe", "reactivate"].includes(action)) {
    const id = typeof raw.id === "string" ? raw.id : ""; if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ success: false, error: "Invalid subscriber." }, { status: 400 });
    const active = action === "reactivate"; const { error } = await supabase.from("mailing_list_subscribers").update({ status: active ? "active" : "unsubscribed", subscribed_at: active ? now : undefined, unsubscribed_at: active ? null : now, updated_at: now }).eq("id", id); if (error) throw error;
  } else return NextResponse.json({ success: false, error: "Invalid action." }, { status: 400 });
  return NextResponse.json({ success: true });
}

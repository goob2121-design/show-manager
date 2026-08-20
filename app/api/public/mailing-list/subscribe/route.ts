import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { renderEmailCenterEmail } from "@/lib/email-center-renderer";
import { cleanMailingListName, isValidMailingListEmail, normalizeMailingListEmail } from "@/lib/mailing-list";
import { MANUAL_EMAIL_REPLY_TO, manualEmailSenders } from "@/lib/manual-email-center";

export const runtime = "nodejs";
const ALLOWED_ORIGINS = new Set(["https://www.cumberlandmountainmusic.com", "https://cumberlandmountainmusic.com"]);
const attempts = new Map<string, number[]>();
function cors(origin: string | null): Record<string, string> { return origin && ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}; }
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Mailing list is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function limited(key: string) {
  const now = Date.now(); const recent = (attempts.get(key) ?? []).filter((time) => now - time < 60_000);
  recent.push(now); attempts.set(key, recent); return recent.length > 8;
}
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: { ...cors(request.headers.get("origin")), "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin"); const headers = cors(origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return NextResponse.json({ success: false, error: "Origin is not allowed." }, { status: 403, headers });
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(key)) return NextResponse.json({ success: false, error: "Please wait before trying again." }, { status: 429, headers });
  try {
    const raw = await request.json() as Record<string, unknown>;
    if (typeof raw.website === "string" && raw.website.trim()) return NextResponse.json({ success: true, status: "subscribed" }, { headers });
    const email = normalizeMailingListEmail(typeof raw.email === "string" ? raw.email : "");
    const firstName = cleanMailingListName(raw.firstName); const lastName = cleanMailingListName(raw.lastName);
    const resubscribe = raw.resubscribe === true;
    if (!isValidMailingListEmail(email)) return NextResponse.json({ success: false, error: "Enter a valid email address." }, { status: 400, headers });
    const supabase = db();
    const { data: existing, error: lookupError } = await supabase.from("mailing_list_subscribers").select("id,status").ilike("email", email).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing?.status === "unsubscribed" && !resubscribe) return NextResponse.json({ success: true, status: "resubscribe_required", message: "This address was previously unsubscribed. Confirm that you want to rejoin." }, { headers });
    const now = new Date().toISOString(); let subscriberId: string; let created = false;
    if (existing) {
      const changes = existing.status === "unsubscribed"
        ? { email, first_name: firstName || null, last_name: lastName || null, status: "active", source: "website", subscribed_at: now, unsubscribed_at: null, updated_at: now }
        : { ...(firstName ? { first_name: firstName } : {}), ...(lastName ? { last_name: lastName } : {}), updated_at: now };
      const { error } = await supabase.from("mailing_list_subscribers").update(changes).eq("id", existing.id); if (error) throw error;
      subscriberId = existing.id;
      if (existing.status === "active") return NextResponse.json({ success: true, status: "already_subscribed", message: "You’re already on the list — thanks for staying connected!" }, { headers });
    } else {
      const { data, error } = await supabase.from("mailing_list_subscribers").insert({ email, first_name: firstName || null, last_name: lastName || null, source: "website", status: "active" }).select("id").single();
      if (error?.code === "23505") return NextResponse.json({ success: true, status: "already_subscribed", message: "Already on the list - thanks for staying connected!" }, { headers });
      if (error) throw error; subscriberId = data.id; created = true;
    }
    if (created && process.env.RESEND_API_KEY) {
      const content = renderEmailCenterEmail({ heading: "Welcome to the CMMS mailing list", message: `Thanks${firstName ? `, ${firstName}` : ""}! You’re on the Cumberland Mountain Music Show mailing list. We’ll keep you updated about upcoming shows and CMMS news.` });
      const sender = manualEmailSenders.find((item) => item.key === "info")!;
      const result = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: sender.from, replyTo: MANUAL_EMAIL_REPLY_TO, to: email, subject: "Welcome to the Cumberland Mountain Music Show mailing list", html: content.html, text: content.text }, { idempotencyKey: `mailing-list-welcome-${subscriberId}` });
      if (result.error) console.error("Mailing-list welcome email failed.", { subscriberId, message: result.error.message });
    }
    return NextResponse.json({ success: true, status: "subscribed", message: "Thanks! You’re on the Cumberland Mountain Music Show mailing list." }, { headers });
  } catch (error) {
    console.error("Mailing-list signup failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to join the mailing list right now." }, { status: 500, headers });
  }
}

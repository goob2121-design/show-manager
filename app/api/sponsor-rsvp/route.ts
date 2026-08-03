import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isValidSponsorCode, normalizeSponsorCode } from "@/lib/sponsor-rsvp";

export const runtime = "nodejs";
const attempts = new Map<string, { count: number; resetAt: number }>();

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Sponsor RSVP is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function limited(request: NextRequest) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count += 1;
  return current.count > 12;
}

async function lookup(code: string) {
  const supabase = serviceClient();
  const { data: sponsor, error } = await supabase.from("sponsor_library")
    .select("id,name,recognition_name,sponsor_code")
    .eq("sponsor_code", code).eq("is_archived", false).maybeSingle();
  if (error) throw error;
  if (!sponsor) return null;
  const today = new Date().toISOString().slice(0, 10);
  const { data: show, error: showError } = await supabase.from("shows")
    .select("id,name,show_date,show_start_time,venue")
    .gte("show_date", today).order("show_date", { ascending: true }).limit(1).maybeSingle();
  if (showError) throw showError;
  if (!show) return { sponsor, show: null, rsvp: null };
  const { data: rsvp, error: rsvpError } = await supabase.from("sponsor_show_rsvps")
    .select("status,guest_count,note,responded_at").eq("sponsor_id", sponsor.id).eq("show_id", show.id).maybeSingle();
  if (rsvpError) throw rsvpError;
  return { sponsor, show, rsvp };
}

export async function POST(request: NextRequest) {
  try {
    if (limited(request)) return NextResponse.json({ error: "Please wait a moment and try again." }, { status: 429 });
    const body = await request.json() as { action?: unknown; code?: unknown; status?: unknown; guestCount?: unknown; note?: unknown };
    const code = normalizeSponsorCode(body.code);
    const invalidMessage = "We couldn't find that Sponsor ID. Please check the code printed in your sponsor packet.";
    if (!isValidSponsorCode(code)) return NextResponse.json({ error: invalidMessage }, { status: 404 });
    const found = await lookup(code);
    if (!found) return NextResponse.json({ error: invalidMessage }, { status: 404 });
    if (body.action !== "submit") {
      return NextResponse.json({
        sponsor: { publicName: found.sponsor.recognition_name?.trim() || found.sponsor.name },
        show: found.show,
        rsvp: found.rsvp,
      });
    }
    if (!found.show) return NextResponse.json({ error: "There is not an upcoming show available for RSVP right now." }, { status: 400 });
    const status = body.status === "attending" ? "attending" : body.status === "not_attending" ? "not_attending" : null;
    const guestCount = status === "attending" ? Number(body.guestCount) : null;
    if (!status) return NextResponse.json({ error: "Please choose whether you will be attending." }, { status: 400 });
    if (status === "attending" && (!Number.isInteger(guestCount) || (guestCount ?? 0) <= 0)) return NextResponse.json({ error: "Please enter how many people will attend." }, { status: 400 });
    const now = new Date().toISOString();
    const { error } = await serviceClient().from("sponsor_show_rsvps").upsert({
      sponsor_id: found.sponsor.id, show_id: found.show.id, status,
      guest_count: guestCount, note: typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null,
      responded_at: now, updated_at: now,
    }, { onConflict: "sponsor_id,show_id" });
    if (error) throw error;
    return NextResponse.json({ success: true, status, guestCount });
  } catch (error) {
    console.error("Sponsor RSVP request failed.", error);
    return NextResponse.json({ error: "Unable to process the RSVP right now. Please try again." }, { status: 500 });
  }
}

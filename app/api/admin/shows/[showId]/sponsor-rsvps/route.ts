import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";

type Context = { params: Promise<{ showId: string }> };
function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE; if (!url || !key) throw new Error("Sponsor RSVP is not configured."); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }
async function authorized(slug: string) { const store = await cookies(); return verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value); }

export async function GET(request: NextRequest, context: Context) {
  const { showId } = await context.params; const slug = request.nextUrl.searchParams.get("slug")?.trim() ?? "";
  if (!slug || !(await authorized(slug))) return NextResponse.json({ error: "Admin access is required." }, { status: 401 });
  const supabase = serviceClient();
  const { data: assignments, error } = await supabase.from("show_sponsors").select("sponsor_id,sponsor:sponsor_library(id,name,recognition_name,sponsor_code)").eq("show_id", showId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: rsvps, error: rsvpError } = await supabase.from("sponsor_show_rsvps").select("*").eq("show_id", showId);
  if (rsvpError) return NextResponse.json({ error: rsvpError.message }, { status: 500 });
  return NextResponse.json({ assignments, rsvps });
}

export async function PATCH(request: NextRequest, context: Context) {
  const { showId } = await context.params; const body = await request.json() as { slug?: unknown; sponsorId?: unknown; status?: unknown; guestCount?: unknown; note?: unknown };
  const slug = typeof body.slug === "string" ? body.slug.trim() : ""; const sponsorId = typeof body.sponsorId === "string" ? body.sponsorId : "";
  if (!slug || !(await authorized(slug))) return NextResponse.json({ error: "Admin access is required." }, { status: 401 });
  const status = body.status === "attending" ? "attending" : body.status === "not_attending" ? "not_attending" : "pending";
  const guestCount = status === "attending" ? Number(body.guestCount) : null;
  if (!sponsorId || (status === "attending" && (!Number.isInteger(guestCount) || (guestCount ?? 0) <= 0))) return NextResponse.json({ error: "A valid sponsor and guest count are required." }, { status: 400 });
  const now = new Date().toISOString();
  const { data, error } = await serviceClient().from("sponsor_show_rsvps").upsert({ sponsor_id: sponsorId, show_id: showId, status, guest_count: guestCount, note: typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null, responded_at: status === "pending" ? null : now, updated_at: now }, { onConflict: "sponsor_id,show_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rsvp: data });
}

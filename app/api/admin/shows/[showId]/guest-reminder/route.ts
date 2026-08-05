import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { buildGuestReminderEmail } from "@/lib/email/guest-reminder-email-content";
import { sendGuestReminderEmail } from "@/lib/email/guest-reminder-email";
import { getGuestReminderMissingItems } from "@/lib/guest-reminder";
import { getStageFlowPublicUrl } from "@/lib/server/stageflow-public-url";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ showId: string }> };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Guest reminder delivery is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest, context: RouteContext) {
  console.log("[Guest Reminder] ROUTE ENTERED");
  try {
    console.log("[Guest Reminder] Reading route params");
    const { showId } = await context.params;
    console.log("[Guest Reminder] Route params read", { showId });
    console.log("[Guest Reminder] Parsing request JSON");
    const body = await request.json() as { slug?: unknown; guestId?: unknown; guestProfileId?: unknown; action?: unknown; additionalNote?: unknown };
    console.log("[Guest Reminder] Request JSON parsed");
    console.log("[Guest Reminder] Body:", JSON.stringify(body, null, 2));
    console.log("[Guest Reminder] showId:", showId);
    if (!body.guestId) {
      console.error("[Guest Reminder] guestId missing");
    } else {
      console.log("[Guest Reminder] guestId:", body.guestId);
    }
    if (!body.action) {
      console.error("[Guest Reminder] action missing");
    } else {
      console.log("[Guest Reminder] action:", body.action);
    }
    if (body.guestProfileId) {
      console.log("[Guest Reminder] guestProfileId:", body.guestProfileId);
    }
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const guestProfileId = typeof body.guestProfileId === "string" ? body.guestProfileId.trim() : "";
    const action = body.action === "send" ? "send" : "preview";
    const additionalNote = typeof body.additionalNote === "string" ? body.additionalNote.trim().slice(0, 2000) : "";
    if (!slug || !guestProfileId) return NextResponse.json({ success: false, error: "Show and guest are required." }, { status: 400 });

    console.log("[Guest Reminder] Loading authentication cookies");
    const cookieStore = await cookies();
    console.log("[Guest Reminder] Authentication cookies loaded");
    if (!verifyAdminSessionCookieValue(slug, cookieStore.get(getAdminSessionCookieName(slug))?.value)) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });

    console.log("[Guest Reminder] Creating service client");
    const supabase = serviceClient();
    console.log("[Guest Reminder] Service client created");
    const { data: show } = await supabase.from("shows").select("id,slug").eq("id", showId).eq("slug", slug).maybeSingle();
    if (!show) return NextResponse.json({ success: false, error: "Show was not found." }, { status: 404 });
    const { data: profile, error: profileError } = await supabase.from("guest_profiles").select("id,name,email,photo_url,short_bio,hometown,instruments,house_band_backing_guest").eq("id", guestProfileId).eq("show_id", showId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ success: false, error: "Guest was not found." }, { status: 404 });
    if (!profile.email?.trim()) return NextResponse.json({ success: false, error: "This guest does not have an email address on file." }, { status: 400 });

    const { count, error: songError } = await supabase.from("show_guest_songs").select("id", { count: "exact", head: true }).eq("show_id", showId).eq("is_placeholder", false).ilike("submitted_by_name", profile.name?.trim() ?? "");
    if (songError) throw songError;
    const missingItems = getGuestReminderMissingItems(profile, count ?? 0);
    const portalUrl = `${getStageFlowPublicUrl(request.nextUrl.origin)}/guest/${encodeURIComponent(profile.id)}`;
    const content = buildGuestReminderEmail({ email: profile.email.trim(), guestName: profile.name ?? "Guest", portalUrl, missingItems, additionalNote });

    if (action === "preview") return NextResponse.json({ success: true, preview: { guestProfileId: profile.id, guestName: profile.name ?? "Guest", ...content } });
    try {
      console.log("[Guest Reminder] About to send email");
      const sent = await sendGuestReminderEmail(content);
      if (!sent.success) {
        console.error("[Guest Reminder] Email send failed:", sent.error);
        return NextResponse.json({ success: false, error: sent.error }, { status: 502 });
      }
      console.log("[Guest Reminder] Email sent successfully");
    } catch (error) {
      console.error("[Guest Reminder] Email send failed:", error);
      throw error;
    }

    const sentAt = new Date().toISOString();
    try {
      console.log("[Guest Reminder] Updating reminder timestamp");
      const { error: updateError } = await supabase.from("guest_profiles").update({ last_reminder_sent_at: sentAt }).eq("id", profile.id).eq("show_id", showId);
      if (updateError) throw updateError;
      console.log("[Guest Reminder] Reminder timestamp updated");
    } catch (error) {
      console.error("[Guest Reminder] Timestamp update failed:", error);
      throw error;
    }

    console.log("[Guest Reminder] Returning success response");
    return NextResponse.json({ success: true, message: "Reminder email sent successfully.", sentAt });
  } catch (error) {
    console.error("[Guest Reminder] Unhandled route exception:", error);
    if (process.env.NODE_ENV !== "production") {
      throw error;
    }
    return NextResponse.json({ success: false, error: "Unable to process the reminder email." }, { status: 500 });
  }
}

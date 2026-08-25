import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { getManualEmailSender, getManualEmailTemplate, MANUAL_EMAIL_REPLY_TO } from "@/lib/manual-email-center";
import { emailCenterShowMergeFields } from "@/app/api/admin/email-center/route";
import { validatePresaleEmailFields } from "@/lib/email-center-presale";
import { processScheduledPresaleCampaign, scheduledCampaignRecipients, type ScheduledPresaleCampaignRow } from "@/lib/scheduled-presale-campaign";

export const runtime = "nodejs";
function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE; if (!url || !key) throw new Error("Scheduled Email Center is not configured."); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
async function authorize(slug: string) {
  if (!slug) return { ok: false as const, status: 400, error: "A show slug is required." };
  const cookieStore = await cookies();
  if (!verifyAdminSessionCookieValue(slug, cookieStore.get(getAdminSessionCookieName(slug))?.value)) return { ok: false as const, status: 401, error: "Admin access is required." };
  const supabase = serviceClient();
  const { data: show, error } = await supabase.from("shows").select("id,slug,name,show_date,show_start_time,ticket_sale_status,presale_starts_at,public_sale_starts_at,ticket_link").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!show) return { ok: false as const, status: 404, error: "Show was not found." };
  return { ok: true as const, supabase, show };
}
async function currentAudience(access: Awaited<ReturnType<typeof authorize>>) {
  if (!access.ok) return { recipients: [], recordsFound: 0, duplicatesRemoved: 0, uniqueRecipients: 0 };
  const { data, error } = await access.supabase.from("mailing_list_subscribers").select("id,email,first_name,last_name,source,status").eq("status", "active");
  if (error) throw error;
  return scheduledCampaignRecipients(data ?? [], access.show);
}
export async function GET(request: NextRequest) {
  try {
    const access = await authorize(text(request.nextUrl.searchParams.get("slug")));
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const [{ data: campaign, error }, audience] = await Promise.all([
      access.supabase.from("scheduled_presale_campaigns").select("*").eq("show_id", access.show.id).maybeSingle(), currentAudience(access),
    ]);
    if (error) throw error;
    const template = getManualEmailTemplate("presale_early_access");
    const fields = emailCenterShowMergeFields(access.show);
    const problem = validatePresaleEmailFields(fields)[0] ?? (!access.show.presale_starts_at || new Date(access.show.presale_starts_at).getTime() <= Date.now() ? "Presale must have a future start time before it can be scheduled." : null);
    return NextResponse.json({ success: true, campaign, currentRecipientCount: audience.recipients.length,
      draft: { showName: access.show.name, showDate: access.show.show_date, scheduledFor: access.show.presale_starts_at,
        subject: template?.subject ?? "", ticketUrl: access.show.ticket_link, valid: Boolean(template && !problem), problem },
      recipients: audience.recipients.map((recipient) => ({ id: recipient.id, name: recipient.name, email: recipient.email, source: recipient.detail })) });
  } catch (error) { console.error("Scheduled Email Center lookup failed.", { message: error instanceof Error ? error.message : "Unknown error" }); return NextResponse.json({ success: false, error: "Unable to load scheduled emails." }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const access = await authorize(text(body.slug));
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    if (text(body.action) === "send_now") {
      const { data: campaign, error: campaignError } = await access.supabase.from("scheduled_presale_campaigns").select("*").eq("show_id", access.show.id).eq("id", text(body.campaignId)).eq("status", "scheduled").maybeSingle();
      if (campaignError) throw campaignError;
      if (!campaign) return NextResponse.json({ success: false, error: "Only an existing scheduled campaign can be sent now." }, { status: 409 });
      const result = await processScheduledPresaleCampaign({ supabase: access.supabase, campaign: campaign as ScheduledPresaleCampaignRow, origin: request.nextUrl.origin, apiKey: process.env.RESEND_API_KEY });
      if (result.status === "not_claimed") return NextResponse.json({ success: false, error: "This campaign cannot send before the presale opens, or it has already been claimed." }, { status: 409 });
      if (result.status === "failed") return NextResponse.json({ success: false, error: result.error }, { status: 500 });
      return NextResponse.json({ success: true, result });
    }
    const template = getManualEmailTemplate("presale_early_access");
    const sender = getManualEmailSender("info");
    if (!template || !sender) return NextResponse.json({ success: false, error: "The Presale / Early Access template is unavailable." }, { status: 500 });
    const fields = emailCenterShowMergeFields(access.show);
    const problems = validatePresaleEmailFields(fields);
    if (problems.length) return NextResponse.json({ success: false, error: problems[0] }, { status: 400 });
    if (!access.show.presale_starts_at || new Date(access.show.presale_starts_at).getTime() <= Date.now()) return NextResponse.json({ success: false, error: "Presale must have a future start time before it can be scheduled." }, { status: 400 });
    const audience = await currentAudience(access);
    const snapshot = { template_key: template.key, audience_key: "mailing_list_subscribers", audience_label: "Mailing List Subscribers",
      sender_key: sender.key, from_address: sender.from, reply_to: MANUAL_EMAIL_REPLY_TO, subject_template: template.subject,
      heading_template: template.heading, message_template: template.message, cta_label_template: template.ctaLabel,
      cta_url_template: "{{ticket_link}}", show_name_snapshot: access.show.name, show_date_snapshot: access.show.show_date,
      presale_starts_at_snapshot: access.show.presale_starts_at, public_sale_starts_at_snapshot: access.show.public_sale_starts_at,
      ticket_url_snapshot: fields.ticket_link, scheduled_for: access.show.presale_starts_at, status: "scheduled",
      recipient_count_at_schedule: audience.recipients.length, final_recipient_count: null, bulk_operation_id: null,
      error_message: null, started_at: null, completed_at: null, cancelled_at: null, updated_at: new Date().toISOString() };
    const { data: existing, error: existingError } = await access.supabase.from("scheduled_presale_campaigns").select("id,status,bulk_operation_id").eq("show_id", access.show.id).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "completed" || existing?.status === "processing") return NextResponse.json({ success: false, error: "This show's presale campaign has already started or completed." }, { status: 409 });
    if (existing?.status === "failed" && existing.bulk_operation_id) return NextResponse.json({ success: false, error: "This campaign began recipient processing. Review its delivery history before attempting another send." }, { status: 409 });
    const result = existing
      ? await access.supabase.from("scheduled_presale_campaigns").update(snapshot).eq("id", existing.id).in("status", ["scheduled", "failed", "cancelled"]).select("*").single()
      : await access.supabase.from("scheduled_presale_campaigns").insert({ show_id: access.show.id, ...snapshot }).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({ success: true, campaign: result.data, currentRecipientCount: audience.recipients.length });
  } catch (error) { console.error("Scheduled Email Center creation failed.", { message: error instanceof Error ? error.message : "Unknown error" }); return NextResponse.json({ success: false, error: "Unable to schedule this presale campaign." }, { status: 500 }); }
}
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const access = await authorize(text(body.slug));
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const now = new Date().toISOString();
    const { data, error } = await access.supabase.from("scheduled_presale_campaigns").update({ status: "cancelled", cancelled_at: now, updated_at: now })
      .eq("show_id", access.show.id).eq("id", text(body.campaignId)).eq("status", "scheduled").select("id").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: "Only a scheduled campaign can be cancelled." }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) { console.error("Scheduled Email Center cancellation failed.", { message: error instanceof Error ? error.message : "Unknown error" }); return NextResponse.json({ success: false, error: "Unable to cancel this scheduled campaign." }, { status: 500 }); }
}

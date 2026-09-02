import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { EMAIL_CENTER_AUDIENCES, recipientsForEmailCenterAudience, renderEmailCenterRecipientEmail, type EmailCenterAudienceKey } from "@/lib/email-center-audiences";
import { emailCenterShowMergeFields, loadEmailCenterRecipients } from "@/app/api/admin/email-center/route";
import { getManualEmailSender, getManualEmailTemplate, MANUAL_EMAIL_REPLY_TO } from "@/lib/manual-email-center";
import { PRESALE_EMAIL_TEMPLATE_KEY, validatePresaleEmailFields } from "@/lib/email-center-presale";
import { processScheduledEmailCampaign, type ScheduledEmailCampaignRow } from "@/lib/scheduled-email-campaign";
import { scheduledEmailRunForEasternDate } from "@/lib/scheduled-email-time";

export const runtime = "nodejs";
function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE; if (!url || !key) throw new Error("Scheduled Email Center is not configured."); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function campaignFields(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) return {}; const raw = value as Record<string, unknown>; return { promo_code: text(raw.promo_code), promo_offer: text(raw.promo_offer), ticket_link: text(raw.ticket_link) }; }
async function authorize(slug: string) {
  if (!slug) return { ok: false as const, status: 400, error: "A show slug is required." };
  const cookieStore = await cookies();
  if (!verifyAdminSessionCookieValue(slug, cookieStore.get(getAdminSessionCookieName(slug))?.value)) return { ok: false as const, status: 401, error: "Admin access is required." };
  const supabase = serviceClient();
  const { data: show, error } = await supabase.from("shows").select("id,slug,name,show_date,show_start_time,ticket_sale_status,presale_starts_at,public_sale_starts_at,ticket_link,presale_access_code").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!show) return { ok: false as const, status: 404, error: "Show was not found." };
  return { ok: true as const, supabase, show };
}

export async function GET(request: NextRequest) {
  try {
    const access = await authorize(text(request.nextUrl.searchParams.get("slug")));
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const [{ data, error }, records] = await Promise.all([
      access.supabase.from("scheduled_email_campaigns").select("*").eq("show_id", access.show.id).order("created_at", { ascending: false }).limit(25),
      loadEmailCenterRecipients(access.supabase, access.show, request.nextUrl.origin),
    ]);
    if (error) throw error;
    const showFields = emailCenterShowMergeFields(access.show);
    const campaignAudiences = Object.fromEntries(((data ?? []) as ScheduledEmailCampaignRow[]).map((campaign) => {
      const audience = recipientsForEmailCenterAudience(records, campaign.audience_key);
      const fields: Record<string, string | undefined> = { ...campaign.campaign_merge_fields, ...(campaign.template_key === PRESALE_EMAIL_TEMPLATE_KEY ? showFields : {}) };
      const rendered = audience.recipients.map((recipient) => renderEmailCenterRecipientEmail({
        recipient: { ...recipient, mergeFields: { ...recipient.mergeFields, ...fields } }, templateKey: campaign.template_key,
        subjectTemplate: campaign.subject_template, messageTemplate: campaign.message_template, headingTemplate: campaign.heading_template,
        ctaLabelTemplate: campaign.cta_label_template, ctaUrlTemplate: campaign.template_key === PRESALE_EMAIL_TEMPLATE_KEY ? "{{ticket_link}}" : campaign.cta_url_template,
        promoOfferTemplate: fields.promo_offer, promoCodeTemplate: fields.promo_code, senderValid: true,
        unsubscribeUrl: recipient.id.startsWith("mailing:") ? "https://stageflow.cumberlandmountainmusic.com/mailing-list/unsubscribe?token=recipient-specific-secure-link" : undefined,
      }));
      const ready = rendered.map((content, index) => ({ content, recipient: audience.recipients[index] })).filter((row) => row.content.ready);
      return [campaign.id, {
        recipients: ready.map((row) => ({ id: row.recipient.id, name: row.recipient.name, email: row.recipient.email })),
        preview: ready[0] ? { subject: ready[0].content.subject, html: ready[0].content.renderedEmail.html } : null,
      }];
    }));
    return NextResponse.json({ success: true, campaigns: data ?? [], campaignAudiences });
  } catch (error) { console.error("Scheduled general campaigns lookup failed.", { message: error instanceof Error ? error.message : "Unknown error" }); return NextResponse.json({ success: false, error: "Unable to load scheduled campaigns." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json() as Record<string, unknown>;
    const access = await authorize(text(raw.slug));
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    if (text(raw.action) === "send_now") {
      const { data, error } = await access.supabase.from("scheduled_email_campaigns").select("*").eq("id", text(raw.campaignId)).eq("show_id", access.show.id).eq("status", "scheduled").maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ success: false, error: "Only an existing scheduled campaign can be sent now." }, { status: 409 });
      const result = await processScheduledEmailCampaign({ supabase: access.supabase, campaign: data as ScheduledEmailCampaignRow, origin: request.nextUrl.origin, apiKey: process.env.RESEND_API_KEY, trigger: "manual" });
      if (result.status === "not_claimed") return NextResponse.json({ success: false, error: "This campaign was already claimed or completed." }, { status: 409 });
      if (result.status === "failed") return NextResponse.json({ success: false, error: result.error }, { status: 500 });
      return NextResponse.json({ success: true, result });
    }
    const audienceKey = text(raw.audienceKey) as EmailCenterAudienceKey;
    const audience = EMAIL_CENTER_AUDIENCES.find((item) => item.key === audienceKey);
    const sender = getManualEmailSender(text(raw.senderKey));
    const template = getManualEmailTemplate(text(raw.templateKey));
    const subject = text(raw.subject); const message = text(raw.message); const heading = text(raw.heading); const ctaLabel = text(raw.ctaLabel);
    const ctaUrl = template?.key === PRESALE_EMAIL_TEMPLATE_KEY ? "{{ticket_link}}" : text(raw.ctaUrl);
    if (!audience || !sender || !template) return NextResponse.json({ success: false, error: "Select a valid audience, sender, and template." }, { status: 400 });
    if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) return NextResponse.json({ success: false, error: "Enter a valid subject." }, { status: 400 });
    if (!message || message.length > 20000) return NextResponse.json({ success: false, error: "Enter a valid message." }, { status: 400 });
    const run = scheduledEmailRunForEasternDate(text(raw.sendDate));
    if (!run) return NextResponse.json({ success: false, error: "Choose a future Eastern date with an available scheduler run." }, { status: 400 });
    const showFields = emailCenterShowMergeFields(access.show);
    if (template.key === PRESALE_EMAIL_TEMPLATE_KEY) { const problems = validatePresaleEmailFields(showFields); if (problems.length) return NextResponse.json({ success: false, error: problems[0] }, { status: 400 }); }
    const records = await loadEmailCenterRecipients(access.supabase, access.show, request.nextUrl.origin);
    const currentAudience = recipientsForEmailCenterAudience(records, audienceKey);
    const fields = campaignFields(raw.campaignMergeFields);
    const previewReady = currentAudience.recipients.filter((recipient) => renderEmailCenterRecipientEmail({ recipient: { ...recipient, mergeFields: { ...recipient.mergeFields, ...fields, ...(template.key === PRESALE_EMAIL_TEMPLATE_KEY ? showFields : {}) } }, templateKey: template.key, subjectTemplate: subject, messageTemplate: message, headingTemplate: heading, ctaLabelTemplate: ctaLabel, ctaUrlTemplate: ctaUrl, promoOfferTemplate: fields.promo_offer, promoCodeTemplate: fields.promo_code, senderValid: true }).ready);
    if (!previewReady.length) return NextResponse.json({ success: false, error: "No current recipients are ready for this scheduled campaign." }, { status: 400 });
    const now = new Date().toISOString();
    const { data, error } = await access.supabase.from("scheduled_email_campaigns").insert({
      show_id: access.show.id, template_key: template.key, audience_key: audience.key, audience_label: audience.label,
      sender_key: sender.key, from_address: sender.from, reply_to: MANUAL_EMAIL_REPLY_TO,
      subject_template: subject, heading_template: heading, message_template: message,
      cta_label_template: ctaLabel, cta_url_template: ctaUrl, campaign_merge_fields: fields,
      scheduled_for: run.toISOString(), status: "scheduled", recipient_count_at_schedule: previewReady.length,
      approved_at: now, updated_at: now,
    }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ success: true, campaign: data, expectedSend: run.toISOString(), currentRecipientCount: previewReady.length });
  } catch (error) { console.error("Scheduled general campaign action failed.", { message: error instanceof Error ? error.message : "Unknown error" }); return NextResponse.json({ success: false, error: "Unable to schedule this campaign." }, { status: 500 }); }
}

export async function DELETE(request: NextRequest) {
  try {
    const raw = await request.json() as Record<string, unknown>;
    const access = await authorize(text(raw.slug));
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const now = new Date().toISOString();
    const { data, error } = await access.supabase.from("scheduled_email_campaigns").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("id", text(raw.campaignId)).eq("show_id", access.show.id).eq("status", "scheduled").select("id").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: "Only a scheduled campaign can be cancelled." }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) { console.error("Scheduled general campaign cancellation failed.", { message: error instanceof Error ? error.message : "Unknown error" }); return NextResponse.json({ success: false, error: "Unable to cancel this scheduled campaign." }, { status: 500 }); }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { emailCenterShowMergeFields, loadEmailCenterRecipients } from "@/app/api/admin/email-center/route";
import { EMAIL_CENTER_AUDIENCES, recipientsForEmailCenterAudience, renderEmailCenterRecipientEmail, type EmailCenterAudienceKey } from "@/lib/email-center-audiences";
import { PRESALE_EMAIL_TEMPLATE_KEY, validatePresaleEmailFields } from "@/lib/email-center-presale";
import { mailingListUnsubscribeUrl } from "@/lib/mailing-list";

export type ScheduledEmailCampaignRow = {
  id: string; show_id: string; template_key: string; audience_key: EmailCenterAudienceKey; audience_label: string;
  sender_key: string; from_address: string; reply_to: string; subject_template: string; heading_template: string;
  message_template: string; cta_label_template: string; cta_url_template: string;
  campaign_merge_fields: Record<string, string>; scheduled_for: string;
  status: "scheduled" | "processing" | "completed" | "failed" | "cancelled";
  recipient_count_at_schedule: number; final_recipient_count: number | null; bulk_operation_id: string | null;
  delivery_trigger: "automatic" | "manual" | null; error_message: string | null; started_at: string | null;
  completed_at: string | null; manually_sent_at: string | null; cancelled_at: string | null; created_at: string; approved_at: string;
};

type ShowRow = { id: string; slug: string; name: string; show_date: string | null; show_start_time: string | null; ticket_sale_status: unknown; presale_starts_at: string | null; public_sale_starts_at: string | null; ticket_link: string | null; presale_access_code: string | null };

async function failCampaign(supabase: SupabaseClient, campaignId: string, message: string) {
  const completedAt = new Date().toISOString();
  await Promise.all([
    supabase.from("scheduled_email_campaigns").update({ status: "failed", error_message: message.slice(0, 1000), completed_at: completedAt, updated_at: completedAt }).eq("id", campaignId).eq("status", "processing"),
    supabase.from("manual_email_bulk_operations").update({ operation_status: "failed", completed_at: completedAt }).eq("id", campaignId).eq("operation_status", "sending"),
  ]);
}

export async function processScheduledEmailCampaign(input: { supabase: SupabaseClient; campaign: ScheduledEmailCampaignRow; origin: string; apiKey: string | undefined; now?: Date; trigger?: "automatic" | "manual" }) {
  const now = input.now ?? new Date();
  const startedAt = now.toISOString();
  const trigger = input.trigger ?? "automatic";
  let claim = input.supabase.from("scheduled_email_campaigns")
    .update({ status: "processing", delivery_trigger: trigger, started_at: startedAt, error_message: null, updated_at: startedAt })
    .eq("id", input.campaign.id).eq("status", "scheduled");
  if (trigger === "automatic") claim = claim.lte("scheduled_for", startedAt);
  const { data: claimed, error: claimError } = await claim.select("*").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { status: "not_claimed" as const };
  const campaign = claimed as ScheduledEmailCampaignRow;
  try {
    const { data: showData, error: showError } = await input.supabase.from("shows")
      .select("id,slug,name,show_date,show_start_time,ticket_sale_status,presale_starts_at,public_sale_starts_at,ticket_link,presale_access_code")
      .eq("id", campaign.show_id).maybeSingle();
    if (showError) throw showError;
    const show = showData as ShowRow | null;
    if (!show) throw new Error("The scheduled show no longer exists.");
    if (!input.apiKey) throw new Error("RESEND_API_KEY is not configured.");
    const audienceDefinition = EMAIL_CENTER_AUDIENCES.find((item) => item.key === campaign.audience_key);
    if (!audienceDefinition) throw new Error("The scheduled audience is no longer supported.");

    const showFields = emailCenterShowMergeFields(show);
    if (campaign.template_key === PRESALE_EMAIL_TEMPLATE_KEY) {
      const problems = validatePresaleEmailFields(showFields);
      if (problems.length) throw new Error(problems[0]);
    }
    const allRecords = await loadEmailCenterRecipients(input.supabase, show, input.origin);
    const audience = recipientsForEmailCenterAudience(allRecords, campaign.audience_key);
    const campaignFields: Record<string, string | undefined> = { ...campaign.campaign_merge_fields, ...(campaign.template_key === PRESALE_EMAIL_TEMPLATE_KEY ? showFields : {}) };
    const rendered = audience.recipients.map((recipient) => {
      const subscriberId = campaign.audience_key === "mailing_list_subscribers" && recipient.id.startsWith("mailing:") ? recipient.id.slice(8) : null;
      const content = renderEmailCenterRecipientEmail({
        recipient: { ...recipient, mergeFields: { ...recipient.mergeFields, ...campaignFields } }, templateKey: campaign.template_key,
        subjectTemplate: campaign.subject_template, messageTemplate: campaign.message_template, headingTemplate: campaign.heading_template,
        ctaLabelTemplate: campaign.cta_label_template,
        ctaUrlTemplate: campaign.template_key === PRESALE_EMAIL_TEMPLATE_KEY ? "{{ticket_link}}" : campaign.cta_url_template,
        promoOfferTemplate: campaignFields.promo_offer, promoCodeTemplate: campaignFields.promo_code, senderValid: true,
        unsubscribeUrl: subscriberId ? mailingListUnsubscribeUrl(input.origin, subscriberId) : undefined,
      });
      return { recipient, subscriberId, ...content };
    });
    const ready = rendered.filter((item) => item.ready);
    if (!ready.length) throw new Error("No current recipients are ready to send.");
    const operationId = campaign.id;
    const { error: operationError } = await input.supabase.from("manual_email_bulk_operations").insert({
      id: operationId, show_id: show.id, audience_key: campaign.audience_key, audience_label: campaign.audience_label,
      template_key: campaign.template_key, sender_key: campaign.sender_key, from_address: campaign.from_address,
      subject_template: campaign.subject_template, requested_recipient_count: audience.recordsFound,
      selected_recipient_count: ready.length, skipped_count: audience.recipients.length - ready.length,
      sent_count: 0, failed_count: 0, operation_status: "sending", started_at: startedAt,
    });
    if (operationError) throw operationError;
    await input.supabase.from("scheduled_email_campaigns").update({ bulk_operation_id: operationId, final_recipient_count: ready.length, updated_at: startedAt }).eq("id", campaign.id).eq("status", "processing");
    const deliveries = ready.map((item) => ({ ...item, deliveryId: crypto.randomUUID(), requestId: crypto.randomUUID() }));
    const { error: historyError } = await input.supabase.from("manual_email_history").insert(deliveries.map((item) => ({
      id: item.deliveryId, show_id: show.id, recipient_name: item.recipient.name || null, recipient_email: item.recipient.email.trim().toLowerCase(),
      from_address: campaign.from_address, reply_to: campaign.reply_to, subject: item.subject, message_text: item.renderedEmail.text,
      template_key: campaign.template_key, send_status: "queued", current_status: "queued", request_id: item.requestId,
      bulk_operation_id: operationId, last_activity_at: startedAt,
    })));
    if (historyError) throw historyError;

    const resend = new Resend(input.apiKey);
    let sentCount = 0;
    let failedCount = 0;
    for (let offset = 0; offset < deliveries.length; offset += 100) {
      const chunk = deliveries.slice(offset, offset + 100);
      const { data, error } = await resend.batch.send(chunk.map((item) => ({
        from: campaign.from_address, replyTo: campaign.reply_to, to: item.recipient.email, subject: item.subject,
        text: item.renderedEmail.text, html: item.renderedEmail.html,
        tags: [{ name: "email_center_delivery_id", value: item.deliveryId }, { name: "bulk_operation_id", value: operationId }, { name: "show_id", value: show.id }],
      })), { idempotencyKey: `scheduled-email-${campaign.id}-${offset / 100}` });
      const providerRows = data?.data ?? [];
      const sentAt = new Date().toISOString();
      await Promise.all(chunk.map(async (item, index) => {
        const providerId = providerRows[index]?.id ?? null;
        if (error || !providerId) {
          failedCount += 1;
          const message = error?.message?.slice(0, 1000) || "Resend did not return a provider ID.";
          await input.supabase.from("manual_email_history").update({ send_status: "failed", current_status: "failed", error_message: message, last_activity_at: sentAt }).eq("id", item.deliveryId);
        } else {
          sentCount += 1;
          await input.supabase.from("manual_email_history").update({ send_status: "sent", current_status: "sent", resend_message_id: providerId, sent_at: sentAt, last_activity_at: sentAt, updated_at: sentAt }).eq("id", item.deliveryId);
          if (item.subscriberId) await input.supabase.from("mailing_list_subscribers").update({ last_campaign_at: sentAt, updated_at: sentAt }).eq("id", item.subscriberId);
        }
      }));
    }
    const completedAt = new Date().toISOString();
    const finalStatus = failedCount === deliveries.length ? "failed" : "completed";
    await Promise.all([
      input.supabase.from("manual_email_bulk_operations").update({ operation_status: finalStatus, sent_count: sentCount, failed_count: failedCount, completed_at: completedAt }).eq("id", operationId),
      input.supabase.from("scheduled_email_campaigns").update({ status: finalStatus, final_recipient_count: deliveries.length, bulk_operation_id: operationId, error_message: failedCount ? `${failedCount} recipient delivery failed.` : null, completed_at: completedAt, manually_sent_at: trigger === "manual" ? completedAt : null, updated_at: completedAt }).eq("id", campaign.id).eq("status", "processing").eq("delivery_trigger", trigger),
    ]);
    return { status: "completed" as const, sentCount, failedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled campaign failed.";
    await failCampaign(input.supabase, campaign.id, message);
    return { status: "failed" as const, error: message };
  }
}

export async function processDueScheduledEmailCampaigns(input: { supabase: SupabaseClient; origin: string; apiKey: string | undefined; now?: Date }) {
  const now = input.now ?? new Date();
  const staleBefore = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const { data: stale, error: staleError } = await input.supabase.from("scheduled_email_campaigns").select("id").eq("status", "processing").lt("started_at", staleBefore);
  if (staleError) throw staleError;
  for (const row of stale ?? []) await failCampaign(input.supabase, row.id, "Scheduled processing was interrupted. Review delivery history before scheduling another send.");
  const { data, error } = await input.supabase.from("scheduled_email_campaigns").select("*").eq("status", "scheduled").lte("scheduled_for", now.toISOString()).order("scheduled_for", { ascending: true }).limit(10);
  if (error) throw error;
  const results = [];
  for (const campaign of (data ?? []) as ScheduledEmailCampaignRow[]) results.push(await processScheduledEmailCampaign({ ...input, campaign, now }));
  return results;
}

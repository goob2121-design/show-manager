import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { recipientsForEmailCenterAudience, renderEmailCenterRecipient, type EmailCenterAudienceRecipient } from "@/lib/email-center-audiences";
import { renderEmailCenterEmail } from "@/lib/email-center-renderer";
import { emailCenterShowMergeFields } from "@/app/api/admin/email-center/route";
import { getEffectiveTicketSaleState } from "@/lib/ticket-sale-status";
import { mailingListUnsubscribeUrl } from "@/lib/mailing-list";
import { splitEmailCenterName } from "@/lib/email-center";
import { isValidManualEmailAddress } from "@/lib/manual-email-center";

export type ScheduledPresaleCampaignRow = {
  id: string; show_id: string; template_key: "presale_early_access"; audience_key: "mailing_list_subscribers";
  audience_label: string; sender_key: string; from_address: string; reply_to: string;
  subject_template: string; heading_template: string; message_template: string;
  cta_label_template: string; cta_url_template: string; show_name_snapshot: string;
  show_date_snapshot: string | null; presale_starts_at_snapshot: string;
  public_sale_starts_at_snapshot: string | null; ticket_url_snapshot: string; presale_access_code_snapshot: string | null;
  scheduled_for: string; status: "scheduled" | "processing" | "completed" | "failed" | "cancelled";
  recipient_count_at_schedule: number; final_recipient_count: number | null;
  bulk_operation_id: string | null; error_message: string | null; started_at: string | null;
  completed_at: string | null; cancelled_at: string | null; created_at: string; updated_at: string;
};

type ShowRow = { id: string; slug: string; name: string; show_date: string | null; show_start_time: string | null; ticket_sale_status: unknown; presale_starts_at: string | null; public_sale_starts_at: string | null; ticket_link: string | null; presale_access_code: string | null };
type SubscriberRow = { id: string; email: string; first_name: string | null; last_name: string | null; source: string; status: string };

export function scheduledCampaignRecipients(subscribers: SubscriberRow[], show: ShowRow) {
  const shared = emailCenterShowMergeFields(show);
  const records: EmailCenterAudienceRecipient[] = subscribers.filter((row) => row.status === "active").map((row) => {
    const names = splitEmailCenterName([row.first_name, row.last_name].filter(Boolean).join(" "));
    const email = row.email.trim().toLowerCase();
    return { id: `mailing:${row.id}`, name: names.fullName, email, sourceLabel: "Mailing List", detail: `Active subscriber - ${row.source}`,
      mergeFields: { ...shared, first_name: names.firstName || "Friend", last_name: names.lastName, full_name: names.fullName || "CMMS Friend", email },
      audienceKeys: ["mailing_list_subscribers"] };
  });
  const audience = recipientsForEmailCenterAudience(records, "mailing_list_subscribers");
  return { ...audience, recipients: audience.recipients.filter((recipient) => isValidManualEmailAddress(recipient.email)) };
}

async function markCampaignFailed(supabase: SupabaseClient, id: string, message: string) {
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from("scheduled_presale_campaigns").update({ status: "failed", error_message: message.slice(0, 1000), completed_at: now, updated_at: now }).eq("id", id).eq("status", "processing"),
    supabase.from("manual_email_bulk_operations").update({ operation_status: "failed", completed_at: now }).eq("id", id).eq("operation_status", "sending"),
  ]);
}

export async function processScheduledPresaleCampaign(input: { supabase: SupabaseClient; campaign: ScheduledPresaleCampaignRow; origin: string; apiKey: string | undefined; now?: Date }) {
  const now = input.now ?? new Date();
  const startedAt = now.toISOString();
  const { data: claimed, error: claimError } = await input.supabase.from("scheduled_presale_campaigns")
    .update({ status: "processing", started_at: startedAt, error_message: null, updated_at: startedAt })
    .eq("id", input.campaign.id).eq("status", "scheduled").lte("scheduled_for", startedAt).select("*").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { status: "not_claimed" as const };
  const campaign = claimed as ScheduledPresaleCampaignRow;
  try {
    const { data: showData, error: showError } = await input.supabase.from("shows")
      .select("id,slug,name,show_date,show_start_time,ticket_sale_status,presale_starts_at,public_sale_starts_at,ticket_link,presale_access_code").eq("id", campaign.show_id).maybeSingle();
    if (showError) throw showError;
    const show = showData as ShowRow | null;
    if (!show) throw new Error("The scheduled show no longer exists.");
    const saleState = getEffectiveTicketSaleState(show, now);
    if (saleState.manualOverride) throw new Error("Manual Not On Sale override is active.");
    if (saleState.configurationError) throw new Error(saleState.configurationError);
    if (saleState.status !== "presale") throw new Error(saleState.status === "public" ? "Public ticket sales have already begun." : "Presale is not active yet.");
    const currentTicketUrl = show.ticket_link?.trim() ?? "";
    if (!/^https:\/\//i.test(currentTicketUrl)) throw new Error("This show does not have a valid ticket link in Show Details.");
    if (currentTicketUrl !== campaign.ticket_url_snapshot) throw new Error("The show's ticket link changed after scheduling. Review and reschedule the campaign.");
    if (!input.apiKey) throw new Error("RESEND_API_KEY is not configured.");

    const { data: subscriberData, error: subscriberError } = await input.supabase.from("mailing_list_subscribers")
      .select("id,email,first_name,last_name,source,status").eq("status", "active");
    if (subscriberError) throw subscriberError;
    const snapshotShow: ShowRow = { ...show, name: campaign.show_name_snapshot, show_date: campaign.show_date_snapshot,
      presale_starts_at: campaign.presale_starts_at_snapshot, public_sale_starts_at: campaign.public_sale_starts_at_snapshot,
      ticket_link: campaign.ticket_url_snapshot, presale_access_code: campaign.presale_access_code_snapshot };
    const audience = scheduledCampaignRecipients((subscriberData ?? []) as SubscriberRow[], snapshotShow);
    const operationId = campaign.id;
    const { error: operationError } = await input.supabase.from("manual_email_bulk_operations").insert({
      id: operationId, show_id: show.id, audience_key: campaign.audience_key, audience_label: campaign.audience_label,
      template_key: campaign.template_key, sender_key: campaign.sender_key, from_address: campaign.from_address,
      subject_template: campaign.subject_template, requested_recipient_count: audience.recordsFound,
      selected_recipient_count: 0, skipped_count: 0, sent_count: 0, failed_count: 0,
      operation_status: "sending", started_at: startedAt,
    });
    if (operationError) throw operationError;
    await input.supabase.from("scheduled_presale_campaigns").update({ bulk_operation_id: operationId, updated_at: new Date().toISOString() }).eq("id", campaign.id).eq("status", "processing");

    const ready: Array<{ recipient: EmailCenterAudienceRecipient; subscriberId: string; deliveryId: string; presaleDeliveryId: string; subject: string; email: ReturnType<typeof renderEmailCenterEmail> }> = [];
    for (const recipient of audience.recipients) {
      const subscriberId = recipient.id.slice("mailing:".length);
      const providerKey = `mailing-list-presale-${show.id}-${subscriberId}`;
      const { data: presaleDelivery, error } = await input.supabase.from("mailing_list_presale_deliveries").insert({
        subscriber_id: subscriberId, show_id: show.id, recipient: recipient.email,
        subject: campaign.subject_template, ticket_url_snapshot: campaign.ticket_url_snapshot,
        provider_idempotency_key: providerKey, send_status: "pending",
      }).select("id").single();
      if (error?.code === "23505") continue;
      if (error) throw error;
      const content = renderEmailCenterRecipient({ recipient, templateKey: campaign.template_key,
        subjectTemplate: campaign.subject_template, headingTemplate: campaign.heading_template,
        messageTemplate: campaign.message_template, ctaLabelTemplate: campaign.cta_label_template,
        ctaUrlTemplate: campaign.cta_url_template, senderValid: true });
      if (!content.ready) {
        await input.supabase.from("mailing_list_presale_deliveries").update({ send_status: "failed", error_message: content.problems.join("; "), failed_at: startedAt, updated_at: startedAt }).eq("id", presaleDelivery.id);
        continue;
      }
      ready.push({ recipient, subscriberId, deliveryId: crypto.randomUUID(), presaleDeliveryId: presaleDelivery.id,
        subject: content.subject, email: renderEmailCenterEmail({ heading: content.heading, message: content.message,
          ctaLabel: content.ctaLabel, ctaUrl: content.ctaUrl, unsubscribeUrl: mailingListUnsubscribeUrl(input.origin, subscriberId) }) });
    }
    await input.supabase.from("manual_email_bulk_operations").update({ selected_recipient_count: ready.length, skipped_count: audience.recipients.length - ready.length }).eq("id", operationId);
    if (ready.length) {
      const { error: historyError } = await input.supabase.from("manual_email_history").insert(ready.map((item) => ({
        id: item.deliveryId, show_id: show.id, recipient_name: item.recipient.name || null, recipient_email: item.recipient.email,
        from_address: campaign.from_address, reply_to: campaign.reply_to, subject: item.subject, message_text: item.email.text,
        template_key: campaign.template_key, send_status: "queued", current_status: "queued",
        request_id: crypto.randomUUID(), bulk_operation_id: operationId, last_activity_at: startedAt,
      })));
      if (historyError) throw historyError;
    }
    const resend = new Resend(input.apiKey);
    let sentCount = 0;
    let failedCount = 0;
    for (let offset = 0; offset < ready.length; offset += 100) {
      const chunk = ready.slice(offset, offset + 100);
      const { data, error: batchError } = await resend.batch.send(chunk.map((item) => ({
        from: campaign.from_address, replyTo: campaign.reply_to, to: item.recipient.email, subject: item.subject,
        text: item.email.text, html: item.email.html, tags: [{ name: "email_center_delivery_id", value: item.deliveryId },
          { name: "bulk_operation_id", value: operationId }, { name: "show_id", value: show.id }],
      })), { idempotencyKey: `scheduled-presale-${campaign.id}-${offset / 100}` });
      const providerRows = data?.data ?? [];
      const completedAt = new Date().toISOString();
      await Promise.all(chunk.map(async (item, index) => {
        const providerId = providerRows[index]?.id ?? null;
        if (batchError || !providerId) {
          const message = batchError?.message?.slice(0, 1000) || "Resend did not return a provider ID.";
          failedCount += 1;
          await Promise.all([
            input.supabase.from("manual_email_history").update({ send_status: "failed", current_status: "failed", error_message: message, last_activity_at: completedAt }).eq("id", item.deliveryId),
            input.supabase.from("mailing_list_presale_deliveries").update({ send_status: "failed", failed_at: completedAt, error_message: message, updated_at: completedAt }).eq("id", item.presaleDeliveryId),
          ]);
        } else {
          sentCount += 1;
          await Promise.all([
            input.supabase.from("manual_email_history").update({ send_status: "sent", current_status: "sent", resend_message_id: providerId, sent_at: completedAt, last_activity_at: completedAt, updated_at: completedAt }).eq("id", item.deliveryId),
            input.supabase.from("mailing_list_presale_deliveries").update({ send_status: "accepted", resend_message_id: providerId, sent_at: completedAt, error_message: null, updated_at: completedAt }).eq("id", item.presaleDeliveryId),
            input.supabase.from("mailing_list_subscribers").update({ last_campaign_at: completedAt, updated_at: completedAt }).eq("id", item.subscriberId),
          ]);
        }
      }));
    }
    const completedAt = new Date().toISOString();
    await Promise.all([
      input.supabase.from("manual_email_bulk_operations").update({ operation_status: failedCount === ready.length && ready.length ? "failed" : "completed", sent_count: sentCount, failed_count: failedCount, completed_at: completedAt }).eq("id", operationId),
      input.supabase.from("scheduled_presale_campaigns").update({ status: failedCount === ready.length && ready.length ? "failed" : "completed", final_recipient_count: ready.length, bulk_operation_id: operationId, error_message: failedCount ? `${failedCount} recipient delivery failed.` : null, completed_at: completedAt, updated_at: completedAt }).eq("id", campaign.id).eq("status", "processing"),
    ]);
    return { status: "completed" as const, sentCount, failedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled campaign failed.";
    await markCampaignFailed(input.supabase, campaign.id, message);
    return { status: "failed" as const, error: message };
  }
}

export async function processDueScheduledPresaleCampaigns(input: { supabase: SupabaseClient; origin: string; apiKey: string | undefined; now?: Date }) {
  const now = input.now ?? new Date();
  const staleBefore = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const { data: stale, error: staleError } = await input.supabase.from("scheduled_presale_campaigns").select("id").eq("status", "processing").lt("started_at", staleBefore);
  if (staleError) throw staleError;
  for (const campaign of stale ?? []) await markCampaignFailed(input.supabase, campaign.id, "Scheduled processing was interrupted before completion. Review delivery history before rescheduling.");
  const { data, error } = await input.supabase.from("scheduled_presale_campaigns").select("*").eq("status", "scheduled").lte("scheduled_for", now.toISOString()).order("scheduled_for", { ascending: true }).limit(10);
  if (error) throw error;
  const results = [];
  for (const campaign of (data ?? []) as ScheduledPresaleCampaignRow[]) results.push(await processScheduledPresaleCampaign({ ...input, campaign, now }));
  return results;
}

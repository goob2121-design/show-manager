import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMailingListPresaleAccessEmail, MAILING_LIST_PRESALE_SUBJECT, sendMailingListPresaleAccessEmail } from "@/lib/mailing-list-presale-email";
import { isValidMailingListEmail, normalizeMailingListEmail } from "@/lib/mailing-list";
import { effectiveTicketSaleStatus } from "@/lib/ticket-sale-status";

type ResendInput = {
  supabase: SupabaseClient;
  subscriberId: string;
  deliveryId: string;
  requestId: string;
  reason?: string | null;
  apiKey: string | undefined;
  now?: Date;
};

function easternDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function resendMailingListPresaleAccess(input: ResendInput) {
  const now = input.now ?? new Date();
  const { data: subscriber, error: subscriberError } = await input.supabase.from("mailing_list_subscribers")
    .select("id,email,first_name,status").eq("id", input.subscriberId).maybeSingle();
  if (subscriberError) throw subscriberError;
  if (!subscriber) return { status: "blocked" as const, httpStatus: 404, error: "Subscriber was not found." };
  if (subscriber.status !== "active") return { status: "blocked" as const, httpStatus: 409, error: "Unsubscribed subscribers cannot receive a presale resend." };
  const recipient = normalizeMailingListEmail(subscriber.email ?? "");
  if (!isValidMailingListEmail(recipient)) return { status: "blocked" as const, httpStatus: 400, error: "The subscriber does not have a valid email address." };

  const { data: delivery, error: deliveryError } = await input.supabase.from("mailing_list_presale_deliveries")
    .select("id,subscriber_id,show_id").eq("id", input.deliveryId).eq("subscriber_id", subscriber.id).maybeSingle();
  if (deliveryError) throw deliveryError;
  if (!delivery) return { status: "blocked" as const, httpStatus: 404, error: "Presale delivery was not found for this subscriber." };

  const { data: show, error: showError } = await input.supabase.from("shows")
    .select("id,name,show_date,is_archived,ticket_link,ticket_sale_status,presale_starts_at,public_sale_starts_at,presale_access_code").eq("id", delivery.show_id).maybeSingle();
  if (showError) throw showError;
  if (!show) return { status: "blocked" as const, httpStatus: 404, error: "Show was not found." };
  if (show.is_archived || !show.show_date || show.show_date < easternDateKey(now)) return { status: "blocked" as const, httpStatus: 409, error: "Presale access cannot be resent for a past or archived show." };
  if (effectiveTicketSaleStatus(show, now) !== "presale") return { status: "blocked" as const, httpStatus: 409, error: "Presale access can only be resent while this show is actively in presale." };
  const ticketUrl = show.ticket_link?.trim() ?? "";
  if (!/^https:\/\//i.test(ticketUrl)) return { status: "blocked" as const, httpStatus: 409, error: "This show does not have a valid HTTPS ticket link." };

  const existingResult = await input.supabase.from("mailing_list_presale_delivery_attempts")
    .select("id,send_status,resend_message_id,error_message,sent_at,failed_at,requested_at").eq("request_id", input.requestId).eq("presale_delivery_id", delivery.id).maybeSingle();
  if (existingResult.error) throw existingResult.error;
  if (existingResult.data) return { status: "duplicate" as const, httpStatus: 200, attempt: existingResult.data };

  const attemptId = crypto.randomUUID();
  const providerIdempotencyKey = `mailing-list-presale-resend-${attemptId}`;
  const content = buildMailingListPresaleAccessEmail({ firstName: subscriber.first_name, showName: show.name, ticketUrl,
    publicSaleStartsAt: show.public_sale_starts_at, presaleCode: show.presale_access_code });
  const reason = input.reason?.trim().slice(0, 500) || null;
  const { data: attempt, error: claimError } = await input.supabase.from("mailing_list_presale_delivery_attempts").insert({
    id: attemptId, presale_delivery_id: delivery.id, request_id: input.requestId, attempt_type: "manual_resend",
    recipient, subject: MAILING_LIST_PRESALE_SUBJECT, ticket_url_snapshot: ticketUrl,
    presale_code_snapshot: show.presale_access_code?.trim() || null, rendered_text_snapshot: content.text,
    administrative_reason: reason, provider_idempotency_key: providerIdempotencyKey, send_status: "pending",
  }).select("id,send_status,resend_message_id,error_message,sent_at,failed_at,requested_at").single();
  if (claimError?.code === "23505") {
    const { data: duplicate, error } = await input.supabase.from("mailing_list_presale_delivery_attempts")
      .select("id,send_status,resend_message_id,error_message,sent_at,failed_at,requested_at").eq("request_id", input.requestId).eq("presale_delivery_id", delivery.id).single();
    if (error) throw error;
    return { status: "duplicate" as const, httpStatus: 200, attempt: duplicate };
  }
  if (claimError) throw claimError;

  const result = await sendMailingListPresaleAccessEmail({ email: recipient, firstName: subscriber.first_name,
    showName: show.name, ticketUrl, publicSaleStartsAt: show.public_sale_starts_at,
    presaleCode: show.presale_access_code, apiKey: input.apiKey, idempotencyKey: providerIdempotencyKey });
  const completedAt = new Date().toISOString();
  if (!result.sent || !result.resendMessageId) {
    const errorMessage = result.errorMessage || "Resend did not return a provider message ID.";
    await input.supabase.from("mailing_list_presale_delivery_attempts").update({ send_status: "failed", error_message: errorMessage, failed_at: completedAt, updated_at: completedAt }).eq("id", attempt.id);
    return { status: "failed" as const, httpStatus: 502, error: errorMessage, attempt: { ...attempt, send_status: "failed", error_message: errorMessage, failed_at: completedAt } };
  }
  const { data: saved, error: saveError } = await input.supabase.from("mailing_list_presale_delivery_attempts").update({
    send_status: "accepted", resend_message_id: result.resendMessageId, sent_at: completedAt, error_message: null, updated_at: completedAt,
  }).eq("id", attempt.id).select("id,send_status,resend_message_id,error_message,sent_at,failed_at,requested_at").single();
  if (saveError) throw saveError;
  return { status: "sent" as const, httpStatus: 200, attempt: saved };
}

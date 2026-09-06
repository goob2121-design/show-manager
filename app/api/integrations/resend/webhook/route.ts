import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  chooseEmailCenterStatus,
  emailCenterEventFingerprint,
  sanitizeTrackedEmailUrl,
} from "@/lib/email-center";
import { classifyReservedSeatEmailClickTarget } from "@/lib/reserved-seat-email-tracking";
import { getResendWebhookHeaderValues, verifyResendWebhookPayload, type VerifiedResendEmailWebhookEvent } from "@/lib/resend-webhook";

export const runtime = "nodejs";

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing server-side Supabase environment variables.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
function isDuplicateInsertError(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && (error.code === "23505" || error.message?.toLowerCase().includes("duplicate key")));
}
function safeEventDetail(event: VerifiedResendEmailWebhookEvent) {
  const data = event.data as unknown as Record<string, unknown>;
  const candidates = [data.reason, data.message, data.error];
  for (const candidate of candidates) if (typeof candidate === "string" && candidate.trim()) return candidate.trim().slice(0, 1000);
  return null;
}
async function storeEmailCenterEvent(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  event: VerifiedResendEmailWebhookEvent,
  resendEmailId: string,
  providerEventId: string | null,
) {
  const { data: matches, error: lookupError } = await supabase.from("manual_email_history")
    .select("id,current_status,last_activity_at").eq("resend_message_id", resendEmailId);
  if (lookupError) throw lookupError;
  if ((matches ?? []).length !== 1) {
    if ((matches ?? []).length > 1) console.error("Resend webhook found multiple Email Center matches.", { emailId: resendEmailId, matchCount: matches?.length });
    return { matched: false, duplicate: false };
  }
  const delivery = matches![0] as { id: string; current_status: string | null; last_activity_at: string | null };
  const clickedUrl = event.type === "email.clicked" ? event.data.click?.link ?? null : null;
  const fingerprint = emailCenterEventFingerprint({
    providerEventId, resendMessageId: resendEmailId, eventType: event.type, createdAt: event.created_at, clickedUrl,
  });
  const { error: insertError } = await supabase.from("manual_email_events").insert({
    email_history_id: delivery.id, resend_message_id: resendEmailId, event_type: event.type,
    event_created_at: event.created_at, recipient: event.data.to[0] ?? null,
    safe_clicked_url: sanitizeTrackedEmailUrl(clickedUrl),
    detail: safeEventDetail(event), provider_event_id: providerEventId, event_fingerprint: fingerprint,
  });
  const duplicate = isDuplicateInsertError(insertError);
  if (insertError && !duplicate) throw insertError;
  if (!duplicate) {
    const nextStatus = chooseEmailCenterStatus(delivery.current_status, event.type);
    const lastActivityAt = !delivery.last_activity_at || event.created_at > delivery.last_activity_at ? event.created_at : delivery.last_activity_at;
    const { error: updateError } = await supabase.from("manual_email_history").update({
      current_status: nextStatus, last_activity_at: lastActivityAt, updated_at: new Date().toISOString(),
      ...(event.type === "email.failed" || event.type === "email.bounced" || event.type === "email.complained"
        ? { error_message: safeEventDetail(event) } : {}),
    }).eq("id", delivery.id);
    if (updateError) throw updateError;
  }
  return { matched: true, duplicate };
}

async function storeMailingListPresaleEvent(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  event: VerifiedResendEmailWebhookEvent,
  resendEmailId: string,
  providerEventId: string | null,
) {
  const { data: matches, error: lookupError } = await supabase.from("mailing_list_presale_deliveries")
    .select("id").eq("resend_message_id", resendEmailId);
  if (lookupError) throw lookupError;
  if ((matches ?? []).length !== 1) {
    if ((matches ?? []).length > 1) console.error("Resend webhook found multiple mailing-list presale matches.", { emailId: resendEmailId, matchCount: matches?.length });
    return { matched: false, duplicate: false };
  }
  const clickedUrl = event.type === "email.clicked" ? event.data.click?.link ?? null : null;
  const fingerprint = emailCenterEventFingerprint({
    providerEventId, resendMessageId: resendEmailId, eventType: event.type,
    createdAt: event.created_at, clickedUrl,
  });
  const { error: insertError } = await supabase.from("mailing_list_presale_delivery_events").insert({
    presale_delivery_id: matches![0].id,
    resend_message_id: resendEmailId,
    event_type: event.type,
    provider_event_id: providerEventId,
    recipient: event.data.to[0] ?? null,
    provider_occurred_at: event.created_at,
    clicked_url: sanitizeTrackedEmailUrl(clickedUrl),
    detail: safeEventDetail(event),
    event_fingerprint: fingerprint,
  });
  const duplicate = isDuplicateInsertError(insertError);
  if (insertError && !duplicate) throw insertError;
  return { matched: true, duplicate };
}

async function storeMailingListPresaleAttemptEvent(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  event: VerifiedResendEmailWebhookEvent,
  resendEmailId: string,
  providerEventId: string | null,
) {
  const { data: matches, error: lookupError } = await supabase.from("mailing_list_presale_delivery_attempts")
    .select("id,presale_delivery_id").eq("resend_message_id", resendEmailId);
  if (lookupError) throw lookupError;
  if ((matches ?? []).length !== 1) {
    if ((matches ?? []).length > 1) console.error("Resend webhook found multiple mailing-list presale attempt matches.", { emailId: resendEmailId, matchCount: matches?.length });
    return { matched: false, duplicate: false };
  }
  const attempt = matches![0];
  const clickedUrl = event.type === "email.clicked" ? event.data.click?.link ?? null : null;
  const fingerprint = emailCenterEventFingerprint({ providerEventId, resendMessageId: resendEmailId,
    eventType: event.type, createdAt: event.created_at, clickedUrl });
  const { error: insertError } = await supabase.from("mailing_list_presale_delivery_events").insert({
    presale_delivery_id: attempt.presale_delivery_id,
    presale_delivery_attempt_id: attempt.id,
    resend_message_id: resendEmailId,
    event_type: event.type,
    provider_event_id: providerEventId,
    recipient: event.data.to[0] ?? null,
    provider_occurred_at: event.created_at,
    clicked_url: sanitizeTrackedEmailUrl(clickedUrl),
    detail: safeEventDetail(event),
    event_fingerprint: fingerprint,
  });
  const duplicate = isDuplicateInsertError(insertError);
  if (insertError && !duplicate) throw insertError;
  return { matched: true, duplicate };
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim() ?? "";
  if (!webhookSecret) return NextResponse.json({ success: false, error: "Webhook signing secret is not configured." }, { status: 500 });
  const payloadText = await request.text();
  if (!payloadText.trim()) return NextResponse.json({ success: false, error: "Webhook payload is required." }, { status: 400 });

  let event: VerifiedResendEmailWebhookEvent;
  try {
    event = verifyResendWebhookPayload(payloadText, request.headers, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook verification failed.";
    const status = /unsupported webhook event type/i.test(message) || /malformed/i.test(message) ? 400 : 401;
    return NextResponse.json({ success: false, error: message }, { status });
  }

  const supabase = createServiceRoleSupabaseClient();
  const resendEmailId = event.data.email_id?.trim() ?? "";
  if (!resendEmailId) return NextResponse.json({ success: false, error: "Webhook payload is missing data.email_id." }, { status: 400 });

  const { data: deliveries, error: deliveriesError } = await supabase.from("reserved_seat_email_deliveries")
    .select("id,reserved_seating_link_id").eq("resend_email_id", resendEmailId);
  if (deliveriesError) {
    console.error("Resend webhook delivery lookup failed.", { message: deliveriesError.message, emailId: resendEmailId, type: event.type });
    return NextResponse.json({ success: false, error: "Unable to match webhook event." }, { status: 500 });
  }
  if ((deliveries ?? []).length > 1) {
    console.error("Resend webhook found multiple delivery matches for one email ID.", { emailId: resendEmailId, type: event.type, matchCount: deliveries?.length ?? 0 });
    return NextResponse.json({ success: true, matched: false });
  }

  const delivery = deliveries?.[0] ?? null;
  const { data: links, error: linksError } = delivery
    ? { data: delivery.reserved_seating_link_id ? [{ id: delivery.reserved_seating_link_id }] : [], error: null }
    : await supabase.from("show_reserved_seating_links").select("id").eq("resend_email_id", resendEmailId);
  if (linksError) {
    console.error("Resend webhook link lookup failed.", { message: linksError.message, emailId: resendEmailId, type: event.type });
    return NextResponse.json({ success: false, error: "Unable to match webhook event." }, { status: 500 });
  }
  if ((links?.length ?? 0) > 1) {
    console.error("Resend webhook found multiple reserved-seat matches for one email ID.", { emailId: resendEmailId, type: event.type, matchCount: links?.length ?? 0 });
    return NextResponse.json({ success: true, matched: false });
  }

  const headerValues = getResendWebhookHeaderValues(request.headers);
  if (!links?.length) {
    try {
      const emailCenterResult = await storeEmailCenterEvent(supabase, event, resendEmailId, headerValues.id || null);
      if (emailCenterResult.matched) return NextResponse.json({ success: true, ...emailCenterResult });
      const presaleResult = await storeMailingListPresaleEvent(supabase, event, resendEmailId, headerValues.id || null);
      if (presaleResult.matched) return NextResponse.json({ success: true, ...presaleResult });
      const attemptResult = await storeMailingListPresaleAttemptEvent(supabase, event, resendEmailId, headerValues.id || null);
      if (!attemptResult.matched) console.warn("Resend webhook received for unmatched email.", { emailId: resendEmailId, type: event.type });
      return NextResponse.json({ success: true, ...attemptResult });
    } catch (error) {
      console.error("Resend webhook non-reserved event storage failed.", { message: error instanceof Error ? error.message : "Unknown error", emailId: resendEmailId, type: event.type });
      return NextResponse.json({ success: false, error: "Unable to store webhook event." }, { status: 500 });
    }
  }

  const clickTarget = event.type === "email.clicked" ? classifyReservedSeatEmailClickTarget(event.data.click?.link ?? null) : null;
  const { error: insertError } = await supabase.from("reserved_seat_email_events").insert({
    resend_email_id: resendEmailId, reserved_seating_link_id: links[0].id,
    email_delivery_id: delivery?.id ?? null, event_type: event.type,
    event_created_at: event.created_at, recipient: event.data.to[0] ?? null,
    click_target: clickTarget, raw_event_id: headerValues.id || null,
  });
  if (insertError && !isDuplicateInsertError(insertError)) {
    console.error("Resend webhook event insert failed.", { message: insertError.message, code: insertError.code, emailId: resendEmailId, type: event.type });
    return NextResponse.json({ success: false, error: "Unable to store webhook event." }, { status: 500 });
  }
  return NextResponse.json({ success: true, matched: true, duplicate: isDuplicateInsertError(insertError) });
}

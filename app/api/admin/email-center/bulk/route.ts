import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import {
  EMAIL_CENTER_AUDIENCES,
  recipientsForEmailCenterAudience,
  renderEmailCenterRecipient,
  type EmailCenterAudienceKey,
} from "@/lib/email-center-audiences";
import { getManualEmailSender, getManualEmailTemplate, MANUAL_EMAIL_REPLY_TO } from "@/lib/manual-email-center";
import { renderEmailCenterEmail } from "@/lib/email-center-renderer";
import { mailingListUnsubscribeUrl } from "@/lib/mailing-list";
import { loadEmailCenterRecipients } from "../route";

export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Email Center bulk sending is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isAudienceKey(value: string): value is EmailCenterAudienceKey {
  return EMAIL_CENTER_AUDIENCES.some((audience) => audience.key === value);
}
async function authorize(slug: string) {
  if (!slug) return { ok: false as const, status: 400, error: "A show slug is required." };
  const cookieStore = await cookies();
  if (!verifyAdminSessionCookieValue(slug, cookieStore.get(getAdminSessionCookieName(slug))?.value)) {
    return { ok: false as const, status: 401, error: "Admin access is required." };
  }
  const supabase = serviceClient();
  const { data: show, error } = await supabase.from("shows")
    .select("id,slug,name,show_date,show_start_time").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!show) return { ok: false as const, status: 404, error: "Show was not found." };
  return { ok: true as const, supabase, show };
}

export async function GET(request: NextRequest) {
  try {
    const access = await authorize(request.nextUrl.searchParams.get("slug")?.trim() ?? "");
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const { data: operations, error } = await access.supabase.from("manual_email_bulk_operations")
      .select("id,audience_key,audience_label,template_key,from_address,requested_recipient_count,selected_recipient_count,skipped_count,sent_count,failed_count,operation_status,started_at,completed_at,created_at")
      .eq("show_id", access.show.id).order("created_at", { ascending: false }).limit(25);
    if (error) throw error;
    const operationIds = (operations ?? []).map((operation) => operation.id);
    const { data: deliveries, error: deliveryError } = operationIds.length
      ? await access.supabase.from("manual_email_history")
        .select("id,bulk_operation_id,recipient_name,recipient_email,subject,current_status,error_message,created_at")
        .in("bulk_operation_id", operationIds).order("created_at", { ascending: true })
      : { data: [], error: null };
    if (deliveryError) throw deliveryError;
    return NextResponse.json({ success: true, operations: operations ?? [], deliveries: deliveries ?? [] });
  } catch (error) {
    console.error("Email Center bulk history failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to load bulk-send history." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json() as unknown;
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const slug = text(body.slug);
    const access = await authorize(slug);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const operationId = text(body.operationId);
    const audienceKey = text(body.audienceKey);
    const senderKey = text(body.senderKey);
    const templateKey = text(body.templateKey);
    const subjectTemplate = text(body.subject);
    const messageTemplate = text(body.message);
    const headingTemplate = text(body.heading);
    const ctaLabelTemplate = text(body.ctaLabel);
    const ctaUrlTemplate = text(body.ctaUrl);
    const selectedRecipientIds = Array.isArray(body.selectedRecipientIds)
      ? [...new Set(body.selectedRecipientIds.map(text).filter(Boolean))] : [];
    const sender = getManualEmailSender(senderKey);
    const template = getManualEmailTemplate(templateKey);
    const audience = EMAIL_CENTER_AUDIENCES.find((item) => item.key === audienceKey);

    if (!validUuid(operationId)) return NextResponse.json({ success: false, error: "A valid bulk operation ID is required." }, { status: 400 });
    if (!isAudienceKey(audienceKey) || !audience) return NextResponse.json({ success: false, error: "Select a valid audience." }, { status: 400 });
    if (!sender) return NextResponse.json({ success: false, error: "Select a valid From address." }, { status: 400 });
    if (!template) return NextResponse.json({ success: false, error: "Select a valid template." }, { status: 400 });
    if (!subjectTemplate || subjectTemplate.length > 200 || /[\r\n]/.test(subjectTemplate)) return NextResponse.json({ success: false, error: "Enter a valid subject." }, { status: 400 });
    if (!messageTemplate || messageTemplate.length > 20000) return NextResponse.json({ success: false, error: "Enter a valid message." }, { status: 400 });

    const allRecords = await loadEmailCenterRecipients(access.supabase, access.show, request.nextUrl.origin);
    const audienceResult = recipientsForEmailCenterAudience(allRecords, audienceKey);
    const selectedSet = new Set(selectedRecipientIds);
    const selected = audienceResult.recipients.filter((recipient) => selectedSet.has(recipient.id));
    const rendered = selected.map((recipient) => {
      const content = renderEmailCenterRecipient({ recipient, subjectTemplate, messageTemplate, headingTemplate, ctaLabelTemplate, ctaUrlTemplate, senderValid: true });
      const subscriberId = audienceKey === "mailing_list_subscribers" && recipient.id.startsWith("mailing:") ? recipient.id.slice(8) : null;
      const unsubscribeUrl = subscriberId ? mailingListUnsubscribeUrl(request.nextUrl.origin, subscriberId) : undefined;
      return { recipient, subscriberId, ...content, renderedEmail: renderEmailCenterEmail({ heading: content.heading, message: content.message, ctaLabel: content.ctaLabel, ctaUrl: content.ctaUrl, unsubscribeUrl }) };
    });
    const ready = rendered.filter((item) => item.ready);
    const skippedCount = audienceResult.recipients.length - ready.length;
    if (!ready.length) return NextResponse.json({ success: false, error: "No selected recipients are ready to send." }, { status: 400 });

    const startedAt = new Date().toISOString();
    const { error: operationError } = await access.supabase.from("manual_email_bulk_operations").insert({
      id: operationId, show_id: access.show.id, audience_key: audienceKey, audience_label: audience.label,
      template_key: template.key, sender_key: sender.key, from_address: sender.from,
      subject_template: subjectTemplate, requested_recipient_count: audienceResult.recordsFound,
      selected_recipient_count: ready.length, skipped_count: skippedCount, sent_count: 0, failed_count: 0,
      operation_status: "sending", started_at: startedAt,
    });
    if (operationError) {
      if (operationError.code === "23505") return NextResponse.json({ success: false, error: "This bulk operation was already submitted." }, { status: 409 });
      throw operationError;
    }

    const claimed = ready.map((item) => ({
      ...item,
      deliveryId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    }));
    const { error: deliveryError } = await access.supabase.from("manual_email_history").insert(claimed.map((item) => ({
      id: item.deliveryId, show_id: access.show.id, recipient_name: item.recipient.name || null,
      recipient_email: item.recipient.email.trim().toLowerCase(), from_address: sender.from,
      reply_to: MANUAL_EMAIL_REPLY_TO, subject: item.subject, message_text: item.renderedEmail.text,
      template_key: template.key, send_status: "queued", current_status: "queued",
      request_id: item.requestId, bulk_operation_id: operationId, last_activity_at: startedAt,
    })));
    if (deliveryError) {
      await access.supabase.from("manual_email_bulk_operations").update({
        operation_status: "failed", failed_count: ready.length, completed_at: new Date().toISOString(),
      }).eq("id", operationId);
      throw deliveryError;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      const failedAt = new Date().toISOString();
      await Promise.all(claimed.map((item) => access.supabase.from("manual_email_history").update({
        send_status: "failed", current_status: "failed", error_message: "Resend is not configured.", last_activity_at: failedAt,
      }).eq("id", item.deliveryId)));
      await access.supabase.from("manual_email_bulk_operations").update({
        operation_status: "failed", failed_count: claimed.length, completed_at: failedAt,
      }).eq("id", operationId);
      return NextResponse.json({ success: false, error: "Resend is not configured." }, { status: 500 });
    }

    const resend = new Resend(apiKey);
    let sentCount = 0;
    let failedCount = 0;
    const results: Array<{ deliveryId: string; recipientEmail: string; status: "sent" | "failed"; error: string | null }> = [];
    for (let offset = 0; offset < claimed.length; offset += 100) {
      const chunk = claimed.slice(offset, offset + 100);
      const { data, error: batchError } = await resend.batch.send(chunk.map((item) => ({
        from: sender.from, replyTo: MANUAL_EMAIL_REPLY_TO, to: item.recipient.email,
        subject: item.subject, text: item.renderedEmail.text, html: item.renderedEmail.html,
        tags: [{ name: "email_center_delivery_id", value: item.deliveryId },
          { name: "bulk_operation_id", value: operationId }, { name: "show_id", value: access.show.id }],
      })), { idempotencyKey: `email-center-bulk-${operationId}-${offset / 100}` });
      const providerRows = data?.data ?? [];
      const completedAt = new Date().toISOString();
      await Promise.all(chunk.map(async (item, index) => {
        const providerId = providerRows[index]?.id ?? null;
        if (batchError || !providerId) {
          const message = batchError?.message?.slice(0, 1000) || "Resend did not return a provider ID.";
          failedCount += 1;
          await access.supabase.from("manual_email_history").update({
            send_status: "failed", current_status: "failed", error_message: message, last_activity_at: completedAt,
          }).eq("id", item.deliveryId);
          results.push({ deliveryId: item.deliveryId, recipientEmail: item.recipient.email, status: "failed", error: message });
          return;
        }
        sentCount += 1;
        await access.supabase.from("manual_email_history").update({
          send_status: "sent", current_status: "sent", resend_message_id: providerId,
          sent_at: completedAt, last_activity_at: completedAt, updated_at: completedAt,
        }).eq("id", item.deliveryId);
        results.push({ deliveryId: item.deliveryId, recipientEmail: item.recipient.email, status: "sent", error: null });
        if (item.subscriberId) await access.supabase.from("mailing_list_subscribers").update({ last_campaign_at: completedAt, updated_at: completedAt }).eq("id", item.subscriberId);
      }));
    }

    const completedAt = new Date().toISOString();
    await access.supabase.from("manual_email_bulk_operations").update({
      operation_status: failedCount === claimed.length ? "failed" : "completed",
      sent_count: sentCount, failed_count: failedCount, completed_at: completedAt,
    }).eq("id", operationId);
    return NextResponse.json({
      success: true, operationId, requestedCount: audienceResult.recordsFound,
      selectedCount: claimed.length, skippedCount, sentCount, failedCount, results,
    });
  } catch (error) {
    console.error("Email Center bulk send failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to complete this bulk send." }, { status: 500 });
  }
}

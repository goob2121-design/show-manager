import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import type { EmailCenterAudienceRecipient } from "@/lib/email-center-audiences";
import { renderEmailCenterEmail } from "@/lib/email-center-renderer";
import { mailingListUnsubscribeUrl } from "@/lib/mailing-list";
import {
  findUnresolvedEmailCenterMergeFields,
  resolveEmailCenterMergeFields,
  splitEmailCenterName,
  type EmailCenterMergeValues,
} from "@/lib/email-center";
import {
  getManualEmailSender,
  getManualEmailTemplate,
  isValidManualEmailAddress,
  MANUAL_EMAIL_REPLY_TO,
} from "@/lib/manual-email-center";
import { formatEmailCenterSaleDate, PRESALE_EMAIL_TEMPLATE_KEY, validatePresaleEmailFields, withPresaleGreetingFallback } from "@/lib/email-center-presale";
import { getEffectiveTicketSaleState } from "@/lib/ticket-sale-status";
import { formatReservedSeatLabel, sortReservedSeatIds } from "@/lib/reserved-seating";
import { buildReservedSeatSelectionUrl } from "@/lib/server/stageflow-public-url";

export const runtime = "nodejs";

type EmailEventRow = {
  id: string; event_type: string; event_created_at: string; recipient: string | null;
  safe_clicked_url: string | null; detail: string | null;
};
type ManualEmailHistoryRow = {
  id: string; recipient_name: string | null; recipient_email: string; from_address: string;
  reply_to: string | null; subject: string; message_text: string | null; template_key: string;
  send_status: "queued" | "sent" | "failed"; current_status: string | null;
  resend_message_id: string | null; error_message: string | null; sent_at: string | null;
  last_activity_at: string | null; created_at: string; manual_email_events?: EmailEventRow[];
};
type Recipient = {
  id: string; name: string; email: string; sourceLabel: string; detail: string;
  mergeFields: EmailCenterMergeValues;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Email Center history is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function validRequestId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function displayShowDate(value: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(date);
}
async function authorize(slug: string) {
  if (!slug) return { ok: false as const, status: 400, error: "A show slug is required." };
  const cookieStore = await cookies();
  if (!verifyAdminSessionCookieValue(slug, cookieStore.get(getAdminSessionCookieName(slug))?.value)) {
    return { ok: false as const, status: 401, error: "Admin access is required." };
  }
  const supabase = serviceClient();
  const { data: show, error } = await supabase.from("shows")
    .select("id,slug,name,show_date,show_start_time,ticket_sale_status,presale_starts_at,public_sale_starts_at,ticket_link").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!show) return { ok: false as const, status: 404, error: "Show was not found." };
  return { ok: true as const, supabase, show };
}
function publicHistory(row: ManualEmailHistoryRow) {
  return {
    id: row.id, recipientName: row.recipient_name, recipientEmail: row.recipient_email,
    fromAddress: row.from_address, replyTo: row.reply_to, subject: row.subject,
    message: row.message_text, templateKey: row.template_key, sendStatus: row.send_status,
    currentStatus: row.current_status ?? row.send_status, resendMessageId: row.resend_message_id,
    errorMessage: row.error_message, sentAt: row.sent_at,
    lastActivityAt: row.last_activity_at ?? row.created_at, createdAt: row.created_at,
    events: (row.manual_email_events ?? []).map((event) => ({
      id: event.id, type: event.event_type, createdAt: event.event_created_at,
      recipient: event.recipient, clickedUrl: event.safe_clicked_url, detail: event.detail,
    })),
  };
}
export function emailCenterShowMergeFields(show: { name: string; show_date: string | null; show_start_time: string | null; presale_starts_at: string | null; public_sale_starts_at: string | null; ticket_link: string | null }) {
  return {
    show_name: show.name, show_date: displayShowDate(show.show_date), show_time: show.show_start_time ?? "",
    presale_start: formatEmailCenterSaleDate(show.presale_starts_at),
    public_sale_start: formatEmailCenterSaleDate(show.public_sale_starts_at),
    ticket_link: show.ticket_link?.trim() ?? "",
  } satisfies EmailCenterMergeValues;
}
export async function loadEmailCenterRecipients(
  supabase: ReturnType<typeof serviceClient>,
  show: { id: string; name: string; show_date: string | null; show_start_time: string | null; presale_starts_at: string | null; public_sale_starts_at: string | null; ticket_link: string | null },
  requestOrigin: string,
) {
  const [linksResult, assignmentsResult, compsResult, guestsResult, sponsorsResult, mailingListResult] = await Promise.all([
    supabase.from("show_reserved_seating_links").select("id,customer_name,email,ticket_count,selection_token,selection_mode,is_complimentary,seat_category,submitted_at").eq("show_id", show.id),
    supabase.from("show_reserved_seat_assignments").select("seating_link_id,seat_id").eq("show_id", show.id),
    supabase.from("show_comp_tickets").select("id,guest_name,email,ticket_count").eq("show_id", show.id),
    supabase.from("guest_profiles").select("id,name,email").eq("show_id", show.id),
    supabase.from("show_sponsors").select("id,sponsor:sponsor_library(name,contact_person,email)").eq("show_id", show.id),
    supabase.from("mailing_list_subscribers").select("id,email,first_name,last_name").eq("status", "active"),
  ]);
  for (const result of [linksResult, assignmentsResult, compsResult, guestsResult, sponsorsResult, mailingListResult]) {
    if (result.error) throw result.error;
  }
  const shared = emailCenterShowMergeFields(show);
  const seatsByLink = new Map<string, string[]>();
  for (const row of (assignmentsResult.data ?? []) as Array<{ seating_link_id: string | null; seat_id: string }>) {
    if (!row.seating_link_id) continue;
    seatsByLink.set(row.seating_link_id, [...(seatsByLink.get(row.seating_link_id) ?? []), row.seat_id]);
  }
  const recipients: EmailCenterAudienceRecipient[] = [];
  for (const row of (linksResult.data ?? []) as Array<{ id: string; customer_name: string; email: string | null; ticket_count: number; selection_token: string; selection_mode: string | null; is_complimentary: boolean | null; seat_category: string | null; submitted_at: string | null }>) {
    const names = splitEmailCenterName(row.customer_name);
    const seats = sortReservedSeatIds(seatsByLink.get(row.id) ?? []).map(formatReservedSeatLabel);
    let reservedSeatLink = "";
    try { reservedSeatLink = buildReservedSeatSelectionUrl(row.selection_token, requestOrigin); } catch { /* optional field */ }
    const email = row.email?.trim().toLowerCase() ?? "";
    const isReserved = row.seat_category !== "general_admission";
    const audienceKeys: EmailCenterAudienceRecipient["audienceKeys"] = ["all_show_contacts"];
    if (row.selection_mode === "imported" && !row.is_complimentary) audienceKeys.push("advance_ticket_buyers");
    if (isReserved) audienceKeys.push("reserved_seat_customers", seats.length ? "reserved_with_seats" : "reserved_nss");
    if (row.is_complimentary) audienceKeys.push("complimentary_guests");
    recipients.push({
      id: `reserved:${row.id}`, name: names.fullName, email,
      sourceLabel: isReserved ? "Reserved Seats" : "Advance Ticket Buyer",
      detail: `${row.ticket_count} Ticket${row.ticket_count === 1 ? "" : "s"} - ${seats.length ? seats.join(", ") : isReserved ? "NSS" : "General Admission"}`,
      audienceKeys,
      mergeFields: { ...shared, first_name: names.firstName, last_name: names.lastName, full_name: names.fullName,
        email, ticket_quantity: String(row.ticket_count),
        seat_numbers: seats.join(", "), reserved_seat_link: reservedSeatLink },
    });
  }
  for (const row of (compsResult.data ?? []) as Array<{ id: string; guest_name: string; email: string | null; ticket_count: number }>) {
    const names = splitEmailCenterName(row.guest_name);
    recipients.push({ id: `comp:${row.id}`, name: names.fullName, email: row.email?.trim().toLowerCase() ?? "",
      sourceLabel: "Complimentary Guest", detail: `${row.ticket_count} Complimentary Ticket${row.ticket_count === 1 ? "" : "s"}`,
      mergeFields: { ...shared, first_name: names.firstName, last_name: names.lastName, full_name: names.fullName,
        email: row.email?.trim().toLowerCase() ?? "", ticket_quantity: String(row.ticket_count) }, audienceKeys: ["complimentary_guests", "all_show_contacts"] });
  }
  for (const row of (guestsResult.data ?? []) as Array<{ id: string; name: string | null; email: string | null }>) {
    const names = splitEmailCenterName(row.name);
    recipients.push({ id: `guest:${row.id}`, name: names.fullName, email: row.email?.trim().toLowerCase() ?? "",
      sourceLabel: "Show Guest", detail: "Guest contact",
      mergeFields: { ...shared, first_name: names.firstName, last_name: names.lastName, full_name: names.fullName, email: row.email?.trim().toLowerCase() ?? "" }, audienceKeys: ["guest_contacts", "all_show_contacts"] });
  }
  for (const row of (sponsorsResult.data ?? []) as Array<{ id: string; sponsor: { name?: string; contact_person?: string; email?: string } | Array<{ name?: string; contact_person?: string; email?: string }> | null }>) {
    const sponsor = Array.isArray(row.sponsor) ? row.sponsor[0] : row.sponsor;
    const email = sponsor?.email?.trim() ?? "";
    const displayName = sponsor?.contact_person?.trim() || sponsor?.name?.trim() || "";
    const names = splitEmailCenterName(displayName);
    recipients.push({ id: `sponsor:${row.id}`, name: names.fullName, email: email.toLowerCase(),
      sourceLabel: "Sponsor Contact", detail: sponsor?.name ?? "Sponsor",
      mergeFields: { ...shared, first_name: names.firstName, last_name: names.lastName, full_name: names.fullName, email: email.toLowerCase() }, audienceKeys: ["sponsors", "all_show_contacts"] });
  }
  for (const row of (mailingListResult.data ?? []) as Array<{ id: string; email: string; first_name: string | null; last_name: string | null }>) {
    const names = splitEmailCenterName([row.first_name, row.last_name].filter(Boolean).join(" "));
    const email = row.email.trim().toLowerCase();
    recipients.push({ id: `mailing:${row.id}`, name: names.fullName, email, sourceLabel: "Mailing List", detail: "Active subscriber",
      mergeFields: { ...shared, first_name: names.firstName || "Friend", last_name: names.lastName, full_name: names.fullName || "CMMS Friend", email }, audienceKeys: ["mailing_list_subscribers"] });
  }
  return recipients.sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
}
const HISTORY_SELECT = "id,recipient_name,recipient_email,from_address,reply_to,subject,message_text,template_key,send_status,current_status,resend_message_id,error_message,sent_at,last_activity_at,created_at,manual_email_events(id,event_type,event_created_at,recipient,safe_clicked_url,detail)";

export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get("slug")?.trim() ?? "";
    const access = await authorize(slug);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    if (request.nextUrl.searchParams.get("mode") === "recipients") {
      const recipients = await loadEmailCenterRecipients(access.supabase, access.show, request.nextUrl.origin);
      const today = new Date().toISOString().slice(0, 10);
      const { data: currentUpcomingShow, error: currentShowError } = await access.supabase.from("shows")
        .select("slug,name,show_date").eq("is_archived", false).gte("show_date", today)
        .order("show_date", { ascending: true }).limit(1).maybeSingle();
      if (currentShowError) throw currentShowError;
      const effectiveSaleState = getEffectiveTicketSaleState(access.show);
      return NextResponse.json({ success: true, recipients, show: emailCenterShowMergeFields(access.show),
        showContext: { slug: access.show.slug, name: access.show.name, showDate: access.show.show_date, ticketSaleStatus: access.show.ticket_sale_status, effectiveTicketSaleStatus: effectiveSaleState.status, ticketSaleManualOverride: effectiveSaleState.manualOverride, ticketSaleConfigurationError: effectiveSaleState.configurationError },
        currentUpcomingShow: currentUpcomingShow ? { slug: currentUpcomingShow.slug, name: currentUpcomingShow.name, showDate: currentUpcomingShow.show_date } : null });
    }
    const { data, error } = await access.supabase.from("manual_email_history").select(HISTORY_SELECT)
      .eq("show_id", access.show.id).order("created_at", { ascending: false })
      .order("event_created_at", { referencedTable: "manual_email_events", ascending: true }).limit(50);
    if (error) throw error;
    return NextResponse.json({ success: true, history: ((data ?? []) as unknown as ManualEmailHistoryRow[]).map(publicHistory) });
  } catch (error) {
    console.error("Email Center history lookup failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to load Email Center data." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json() as unknown;
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, unknown> : {};
    const slug = stringValue(body.slug);
    const access = await authorize(slug);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const requestId = stringValue(body.requestId);
    const recipientEmail = stringValue(body.recipientEmail).toLowerCase();
    const recipientName = stringValue(body.recipientName);
    const selectedRecipientId = stringValue(body.selectedRecipientId);
    const senderKey = stringValue(body.senderKey);
    const templateKey = stringValue(body.templateKey);
    const subjectTemplate = stringValue(body.subject);
    const messageTemplate = stringValue(body.message);
    const headingTemplate = stringValue(body.heading);
    const ctaLabelTemplate = stringValue(body.ctaLabel);
    const ctaUrlTemplate = templateKey === PRESALE_EMAIL_TEMPLATE_KEY ? "{{ticket_link}}" : stringValue(body.ctaUrl);
    const sender = getManualEmailSender(senderKey);
    const template = getManualEmailTemplate(templateKey);
    const rawMergeFields = body.mergeFields && typeof body.mergeFields === "object" && !Array.isArray(body.mergeFields)
      ? body.mergeFields as Record<string, unknown> : {};
    const clientMergeFields = Object.fromEntries(Object.entries(rawMergeFields).map(([key, value]) => [key, stringValue(value)])) as EmailCenterMergeValues;
    const mergeFields = templateKey === PRESALE_EMAIL_TEMPLATE_KEY
      ? withPresaleGreetingFallback({ ...clientMergeFields, ...emailCenterShowMergeFields(access.show) })
      : clientMergeFields;
    const presaleProblems = templateKey === PRESALE_EMAIL_TEMPLATE_KEY ? validatePresaleEmailFields(mergeFields) : [];
    if (presaleProblems.length) return NextResponse.json({ success: false, error: presaleProblems[0] }, { status: 400 });
    const resolvedSubject = resolveEmailCenterMergeFields(subjectTemplate, mergeFields);
    const resolvedMessage = resolveEmailCenterMergeFields(messageTemplate, mergeFields);
    const resolvedHeading = resolveEmailCenterMergeFields(headingTemplate, mergeFields);
    const resolvedCtaLabel = resolveEmailCenterMergeFields(ctaLabelTemplate, mergeFields);
    const resolvedCtaUrl = resolveEmailCenterMergeFields(ctaUrlTemplate, mergeFields);
    const resolvedPromoOffer = resolveEmailCenterMergeFields(mergeFields.promo_offer ?? "", mergeFields);
    const resolvedPromoCode = resolveEmailCenterMergeFields(mergeFields.promo_code ?? "", mergeFields);
    const unresolved = findUnresolvedEmailCenterMergeFields(resolvedSubject.rendered, resolvedMessage.rendered, resolvedHeading.rendered, resolvedCtaLabel.rendered, resolvedCtaUrl.rendered, resolvedPromoOffer.rendered, resolvedPromoCode.rendered);

    if (!validRequestId(requestId)) return NextResponse.json({ success: false, error: "A valid send request ID is required." }, { status: 400 });
    if (!isValidManualEmailAddress(recipientEmail)) return NextResponse.json({ success: false, error: "Enter a valid recipient email address." }, { status: 400 });
    if (!sender) return NextResponse.json({ success: false, error: "Select a valid From address." }, { status: 400 });
    if (!template) return NextResponse.json({ success: false, error: "Select a valid email template." }, { status: 400 });
    if (!resolvedSubject.rendered || resolvedSubject.rendered.length > 200 || /[\r\n]/.test(resolvedSubject.rendered)) return NextResponse.json({ success: false, error: "Enter a subject of 200 characters or fewer." }, { status: 400 });
    if (!resolvedMessage.rendered || resolvedMessage.rendered.length > 20000) return NextResponse.json({ success: false, error: "Enter a message of 20,000 characters or fewer." }, { status: 400 });
    if (Boolean(resolvedPromoOffer.rendered) !== Boolean(resolvedPromoCode.rendered)) return NextResponse.json({ success: false, error: "Promotion requires both offer text and a promo code." }, { status: 400 });
    if (Boolean(resolvedCtaLabel.rendered) !== Boolean(resolvedCtaUrl.rendered)) return NextResponse.json({ success: false, error: "CTA label and URL must both be provided." }, { status: 400 });
    if (resolvedCtaUrl.rendered && !/^https:\/\//i.test(resolvedCtaUrl.rendered)) return NextResponse.json({ success: false, error: "CTA URL must use HTTPS." }, { status: 400 });
    if (unresolved.length) return NextResponse.json({ success: false, error: `Resolve merge field: ${unresolved[0]}` }, { status: 400 });
    let unsubscribeUrl: string | undefined;
    if (selectedRecipientId.startsWith("mailing:")) {
      const subscriberId = selectedRecipientId.slice(8);
      const { data: subscriber } = await access.supabase.from("mailing_list_subscribers").select("id,email,status").eq("id", subscriberId).maybeSingle();
      if (!subscriber || subscriber.status !== "active" || subscriber.email.trim().toLowerCase() !== recipientEmail) return NextResponse.json({ success: false, error: "This mailing-list subscriber is no longer active." }, { status: 409 });
      unsubscribeUrl = mailingListUnsubscribeUrl(request.nextUrl.origin, subscriber.id);
    }
    const renderedEmail = renderEmailCenterEmail({ heading: resolvedHeading.rendered, message: resolvedMessage.rendered, ctaLabel: resolvedCtaLabel.rendered, ctaUrl: resolvedCtaUrl.rendered, promoOffer: resolvedPromoOffer.rendered, promoCode: resolvedPromoCode.rendered, unsubscribeUrl });

    const now = new Date().toISOString();
    const { data: delivery, error: claimError } = await access.supabase.from("manual_email_history").insert({
      show_id: access.show.id, recipient_name: recipientName || null, recipient_email: recipientEmail,
      from_address: sender.from, reply_to: MANUAL_EMAIL_REPLY_TO, subject: resolvedSubject.rendered,
      message_text: renderedEmail.text, template_key: template.key, send_status: "queued",
      current_status: "queued", resend_message_id: null, error_message: null, request_id: requestId,
      last_activity_at: now,
    }).select(HISTORY_SELECT).single();
    if (claimError) {
      if (claimError.code === "23505") return NextResponse.json({ success: false, error: "This send request was already processed." }, { status: 409 });
      throw claimError;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      await access.supabase.from("manual_email_history").update({ send_status: "failed", current_status: "failed", error_message: "Resend is not configured.", last_activity_at: now }).eq("id", delivery.id);
      return NextResponse.json({ success: false, error: "Resend is not configured." }, { status: 500 });
    }
    const { data, error: resendError } = await new Resend(apiKey).emails.send({
      from: sender.from, replyTo: MANUAL_EMAIL_REPLY_TO, to: recipientEmail,
      subject: resolvedSubject.rendered, text: renderedEmail.text, html: renderedEmail.html,
      tags: [{ name: "email_center_delivery_id", value: delivery.id }, { name: "show_id", value: access.show.id }],
    }, { idempotencyKey: `email-center-${requestId}` });

    if (resendError) {
      const safeError = typeof resendError.message === "string" ? resendError.message.slice(0, 1000) : "Resend could not send this email.";
      await access.supabase.from("manual_email_history").update({ send_status: "failed", current_status: "failed", error_message: safeError, last_activity_at: new Date().toISOString() }).eq("id", delivery.id);
      return NextResponse.json({ success: false, error: "The email could not be sent. Please review the details and try again." }, { status: 502 });
    }

    const sentAt = new Date().toISOString();
    const resendMessageId = data?.id ?? null;
    const { data: saved, error: saveError } = await access.supabase.from("manual_email_history").update({
      send_status: "sent", current_status: "sent", resend_message_id: resendMessageId,
      sent_at: sentAt, last_activity_at: sentAt, error_message: null, updated_at: sentAt,
    }).eq("id", delivery.id).select(HISTORY_SELECT).single();
    if (saveError) {
      console.error("Email Center sent-history update failed.", { message: saveError.message, deliveryId: delivery.id });
      return NextResponse.json({ success: true, resendMessageId, history: null, warning: "The email was sent, but its delivery status could not be saved." });
    }
    return NextResponse.json({ success: true, resendMessageId, history: publicHistory(saved as unknown as ManualEmailHistoryRow) });
  } catch (error) {
    console.error("Email Center send failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to send this email." }, { status: 500 });
  }
}

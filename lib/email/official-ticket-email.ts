import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  RESERVED_SEAT_EMAIL_EVENT_NAME,
  RESERVED_SEAT_EMAIL_FROM,
  RESERVED_SEAT_EMAIL_REPLY_TO,
  buildTicketCodeSection,
  type ReservedSeatEmailContent,
  type ReservedSeatEmailResult,
} from "@/lib/email/reserved-seat-email";
import { CMMS_EMAIL_LOGO_SRC, loadCmmsEmailLogoAsset } from "@/lib/email/cmms-email-logo";
import {
  buildTicketCodeEmailAssets,
  getTicketCodeEmailImageSources,
} from "@/lib/email/ticket-code-attachments";
import { RESERVED_SEATING_VENUE, formatReservedSeatLabel, sortReservedSeatIds } from "@/lib/reserved-seating";
import { buildReservedSeatSelectionUrl, isStageFlowPublicUrl } from "@/lib/server/stageflow-public-url";

type OfficialTicketLinkRow = {
  id: string;
  show_id: string;
  customer_name: string;
  email: string | null;
  ticket_count: number;
  selection_token: string;
  scan_token: string | null;
  submitted_at: string | null;
};

type OfficialTicketShowRow = {
  name: string;
  show_date: string | null;
  show_start_time: string | null;
  venue: string | null;
  venue_address: string | null;
  ticket_code_format: string | null;
};

export type OfficialTicketEmailInput = {
  customerName: string;
  customerEmail: string;
  eventName: string;
  showDate: string;
  showTime: string | null;
  venueName: string;
  venueAddress: string;
  seatLabels: string[];
  ticketCount: number;
  scanToken: string;
  ticketCodeFormat: string | null;
  viewTicketUrl: string;
  printTicketUrl: string;
  publicOrigin?: string;
};

export type OfficialTicketDeliveryResult = ReservedSeatEmailResult & {
  reservationId: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatShowDate(value: string | null) {
  if (!value) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function buildOfficialTicketEmail(input: OfficialTicketEmailInput, logoSrc: string | null = CMMS_EMAIL_LOGO_SRC): ReservedSeatEmailContent {
  const safe = {
    customerName: escapeHtml(input.customerName.trim() || "Guest"),
    eventName: escapeHtml(input.eventName.trim() || RESERVED_SEAT_EMAIL_EVENT_NAME),
    showDate: escapeHtml(input.showDate.trim()),
    showTime: escapeHtml(input.showTime?.trim() ?? ""),
    venueName: escapeHtml(input.venueName.trim()),
    venueAddress: escapeHtml(input.venueAddress.trim()),
    seats: escapeHtml(input.seatLabels.join(" • ")),
    phoneTicketUrl: escapeHtml(`${input.viewTicketUrl}?phone=1`),
    viewTicketUrl: escapeHtml(input.viewTicketUrl),
    printTicketUrl: escapeHtml(input.printTicketUrl),
  };
  const codeSection = buildTicketCodeSection({
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    showName: input.eventName,
    showDate: input.showDate,
    showTime: input.showTime,
    venueName: input.venueName,
    venueAddress: input.venueAddress,
    ticketCount: input.ticketCount,
    seatSelectionUrl: input.viewTicketUrl,
    scanToken: input.scanToken,
    ticketCodeFormat: input.ticketCodeFormat,
    assignedSeatLabels: input.seatLabels,
  }, getTicketCodeEmailImageSources(input.ticketCodeFormat));
  const details = [
    ["Guest", safe.customerName],
    ["Event", safe.eventName],
    ["Date", safe.showDate],
    ...(safe.showTime ? [["Time", safe.showTime]] : []),
    ["Venue", safe.venueName],
    ["Address", safe.venueAddress],
    ["Reserved Seats", safe.seats],
  ].map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;vertical-align:top;">${label}</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600;vertical-align:top;">${value}</td></tr>`).join("");
  const subject = `Your Official Tickets - ${input.eventName.trim() || RESERVED_SEAT_EMAIL_EVENT_NAME}`;
  const html = `<!doctype html><html><body style="margin:0;background:#e2e8f0;font-family:Arial,sans-serif;color:#0f172a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e2e8f0;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:8px;overflow:hidden;"><tr><td align="center" style="background:#071426;padding:24px;">${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="Cumberland Mountain Music Show" width="260" style="display:block;width:100%;max-width:260px;height:auto;border:0;">` : `<div style="color:#fbbf24;font-size:20px;font-weight:700;">The Cumberland Mountain Music Show</div>`}</td></tr><tr><td style="padding:32px 28px;"><h1 style="margin:0 0 8px;text-align:center;color:#071426;font-size:28px;line-height:1.2;">Your Seats Are Confirmed</h1><p style="margin:0 0 24px;text-align:center;color:#a36b12;font-size:13px;font-weight:700;">OFFICIAL TICKET</p><p style="margin:0 0 18px;font-size:18px;font-weight:700;color:#071426;">Hi ${safe.customerName},</p><p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Your seats are confirmed.</p><p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Present this QR code or barcode on your phone when you arrive, or print this email.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;"><tr><td style="padding:18px;"><table role="presentation" cellspacing="0" cellpadding="0">${details}</table></td></tr></table>${codeSection.html}<p style="margin:28px 0 6px;text-align:center;color:#071426;font-size:16px;font-weight:700;line-height:1.5;">Most guests simply use their phone at the door.</p><p style="margin:0 0 18px;text-align:center;color:#334155;font-size:14px;line-height:1.6;">Tap &quot;Phone-Friendly Ticket&quot; for the quickest entry. You may also print your ticket if you prefer.</p><table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 12px;"><tr><td align="center" bgcolor="#d89b2b" style="border-radius:5px;"><a href="${safe.phoneTicketUrl}" style="display:block;width:250px;padding:14px 18px;color:#071426;font-size:15px;font-weight:700;text-decoration:none;">&#128241; Phone-Friendly Ticket</a></td></tr><tr><td height="10"></td></tr><tr><td align="center" style="border:1px solid #0f3b5f;border-radius:5px;"><a href="${safe.printTicketUrl}" style="display:block;width:250px;padding:13px 18px;color:#0f3b5f;font-size:15px;font-weight:700;text-decoration:none;">&#128424;&#65039; Print Ticket</a></td></tr><tr><td height="10"></td></tr><tr><td align="center" style="border:1px solid #64748b;border-radius:5px;"><a href="${safe.viewTicketUrl}" style="display:block;width:250px;padding:13px 18px;color:#334155;font-size:15px;font-weight:700;text-decoration:none;">&#127760; View Standard Ticket</a></td></tr></table></td></tr><tr><td align="center" style="background:#071426;padding:28px 24px;color:#cbd5e1;font-size:13px;line-height:1.8;"><strong style="color:#ffffff;">The Cumberland Mountain Music Show</strong><br>Big-Time Show, Small-Town Hospitality</td></tr></table></td></tr></table></body></html>`;
  const text = [
    "YOUR SEATS ARE CONFIRMED",
    "",
    `Hi ${input.customerName.trim() || "Guest"},`,
    "",
    "Present this QR code or barcode on your phone when you arrive, or print this email.",
    "",
    `Event: ${input.eventName}`,
    `Date: ${input.showDate}`,
    ...(input.showTime?.trim() ? [`Time: ${input.showTime.trim()}`] : []),
    `Venue: ${input.venueName}`,
    `Address: ${input.venueAddress}`,
    `Reserved Seats: ${input.seatLabels.join(" • ")}`,
    "",
    codeSection.text,
    "Most guests simply use their phone at the door.",
    "Tap Phone-Friendly Ticket for the quickest entry. You may also print your ticket if you prefer.",
    `Phone-Friendly Ticket: ${input.viewTicketUrl}?phone=1`,
    `Print Ticket: ${input.printTicketUrl}`,
    `View Standard Ticket: ${input.viewTicketUrl}`,
  ].join("\n");
  return { subject, html, text };
}

export async function sendOfficialTicketEmail(input: OfficialTicketEmailInput): Promise<ReservedSeatEmailResult> {
  if (!validEmail(input.customerEmail)) return { success: false, resendId: null, error: "A valid customer email is required." };
  if (!isStageFlowPublicUrl(input.viewTicketUrl, input.publicOrigin) || !isStageFlowPublicUrl(input.printTicketUrl, input.publicOrigin)) {
    return { success: false, resendId: null, error: "Official ticket links must use the configured StageFlow public URL." };
  }
  if (!process.env.RESEND_API_KEY) return { success: false, resendId: null, error: "Email service is not configured." };
  try {
    const ticketCodeAssets = await buildTicketCodeEmailAssets(input.scanToken, input.ticketCodeFormat);
    const logoAsset = await loadCmmsEmailLogoAsset();
    const content = buildOfficialTicketEmail(input, logoAsset?.src ?? null);
    const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: RESERVED_SEAT_EMAIL_FROM,
      replyTo: RESERVED_SEAT_EMAIL_REPLY_TO,
      to: input.customerEmail.trim(),
      subject: content.subject,
      html: content.html,
      text: content.text,
      attachments: logoAsset ? [logoAsset.attachment, ...ticketCodeAssets.attachments] : ticketCodeAssets.attachments,
    });
    if (error) return { success: false, resendId: null, error: error.message || "Email delivery failed." };
    return { success: true, resendId: data?.id ?? null, error: null };
  } catch (error) {
    return { success: false, resendId: null, error: error instanceof Error ? error.message : "Email delivery failed." };
  }
}

export async function deliverOfficialTicketEmail(
  supabase: SupabaseClient,
  reservationId: string,
  options: {
    requestOrigin?: string;
    sender?: (input: OfficialTicketEmailInput) => Promise<ReservedSeatEmailResult>;
  } = {},
): Promise<OfficialTicketDeliveryResult> {
  const sender = options.sender ?? sendOfficialTicketEmail;
  const { data: linkData, error: linkError } = await supabase
    .from("show_reserved_seating_links")
    .select("id,show_id,customer_name,email,ticket_count,selection_token,scan_token,submitted_at")
    .eq("id", reservationId)
    .maybeSingle();
  if (linkError) throw linkError;
  const link = linkData as OfficialTicketLinkRow | null;
  if (!link) return { success: false, resendId: null, error: "Reservation was not found.", reservationId };
  if (!link.submitted_at) return { success: false, resendId: null, error: "Seats must be confirmed before tickets can be emailed.", reservationId: link.id };
  if (!link.scan_token) return { success: false, resendId: null, error: "This reservation does not have an entry code.", reservationId: link.id };

  const [{ data: showData, error: showError }, { data: assignmentData, error: assignmentError }] = await Promise.all([
    supabase.from("shows").select("name,show_date,show_start_time,venue,venue_address,ticket_code_format").eq("id", link.show_id).maybeSingle(),
    supabase.from("show_reserved_seat_assignments").select("seat_id").eq("seating_link_id", link.id).order("created_at", { ascending: true }),
  ]);
  if (showError) throw showError;
  if (assignmentError) throw assignmentError;
  const show = showData as OfficialTicketShowRow | null;
  if (!show) return { success: false, resendId: null, error: "Show was not found.", reservationId: link.id };
  const seatLabels = sortReservedSeatIds(((assignmentData ?? []) as Array<{ seat_id: string }>).map((item) => item.seat_id)).map(formatReservedSeatLabel);
  if (!seatLabels.length) return { success: false, resendId: null, error: "No confirmed seats were found.", reservationId: link.id };

  try {
    const viewTicketUrl = buildReservedSeatSelectionUrl(link.selection_token, options.requestOrigin);
    const result = await sender({
      customerName: link.customer_name,
      customerEmail: link.email ?? "",
      eventName: show.name?.trim() || RESERVED_SEAT_EMAIL_EVENT_NAME,
      showDate: formatShowDate(show.show_date),
      showTime: show.show_start_time,
      venueName: show.venue?.trim() || RESERVED_SEATING_VENUE.venueName,
      venueAddress: show.venue_address?.trim() || RESERVED_SEATING_VENUE.venueAddress,
      seatLabels,
      ticketCount: link.ticket_count,
      scanToken: link.scan_token,
      ticketCodeFormat: show.ticket_code_format,
      viewTicketUrl,
      printTicketUrl: `${viewTicketUrl}?print=1`,
      publicOrigin: options.requestOrigin,
    });
    if (result.success) {
      console.info("Official ticket email sent.", { reservationId: link.id, resendId: result.resendId });
    } else {
      console.error("Official ticket email failed.", { reservationId: link.id, error: result.error });
    }
    return { ...result, reservationId: link.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Official ticket email delivery failed.";
    console.error("Official ticket email failed.", { reservationId: link.id, error: message });
    return { success: false, resendId: null, error: message, reservationId: link.id };
  }
}
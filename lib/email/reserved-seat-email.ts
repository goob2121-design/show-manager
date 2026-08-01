import { Resend } from "resend";
import { CMMS_EMAIL_LOGO_SRC, loadCmmsEmailLogoAsset } from "@/lib/email/cmms-email-logo";
import { buildTicketCodeEmailAssets, getTicketCodeEmailImageSources } from "@/lib/email/ticket-code-attachments";
import { buildReservationTicketCodeDisplay } from "@/lib/reservation-ticket-code-display";
import { isStageFlowPublicUrl } from "@/lib/server/stageflow-public-url";

export const RESERVED_SEAT_EMAIL_FROM = "The Cumberland Mountain Music Show <tickets@cumberlandmountainmusic.com>";
export const RESERVED_SEAT_EMAIL_REPLY_TO = "info@cumberlandmountainmusic.com";
export const RESERVED_SEAT_EMAIL_EVENT_NAME = "The Cumberland Mountain Music Show";
export const DEFAULT_RESERVED_SEAT_PARKING_INFORMATION = "Free parking is available on-site at the Cumberland Gap Convention Center.";

export type ReservedSeatEmailInput = {
  customerName: string;
  customerEmail: string;
  showName: string;
  showDate: string;
  showTime?: string | null;
  venueName: string;
  venueAddress: string;
  ticketCount: number;
  seatSelectionUrl: string;
  scanToken?: string | null;
  ticketCodeFormat?: string | null;
  assignedSeatLabels?: string[];
  categoryLabel?: string | null;
  parkingInformation?: string | null;
};

export type ReservedSeatEmailContent = { subject: string; html: string; text: string };
export type ReservedSeatEmailResult = { success: boolean; resendId: string | null; error: string | null };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}


export function buildGoogleMapsDirectionsUrl(venueName: string, venueAddress: string) {
  const destination = [venueName.trim(), venueAddress.trim()].filter(Boolean).join(", ");
  if (!destination) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
}
function reservedSeatPurchaseText(ticketCount: number) {
  const count = Math.max(1, Math.floor(ticketCount) || 1);
  return `${count} seat${count === 1 ? "" : "s"}`;
}

function formatCustomerShowDate(showDate: string) {
  const value = showDate.trim();
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
function ticketsPurchasedText(ticketCount: number) {
  const count = Math.max(1, Math.floor(ticketCount) || 1);
  return `${count} Reserved Seat${count === 1 ? "" : "s"}`;
}

function seatSelectionInstruction(ticketCount: number) {
  const count = Math.max(1, Math.floor(ticketCount) || 1);
  return count === 1
    ? "Please choose your reserved seat using the button above."
    : `Please choose your ${count} reserved seats using the button above.`;
}

export function buildTicketCodeSection(
  input: ReservedSeatEmailInput,
  imageSources?: {
    qrImageSrc?: string | null;
    barcodeImageSrc?: string | null;
  },
) {
  if (!input.scanToken) {
    return { html: "", text: "" };
  }

  try {
    const display = buildReservationTicketCodeDisplay(input.scanToken, input.ticketCodeFormat);

    if (!display) {
      return { html: "", text: "" };
    }

    const ticketCount = Math.max(1, Math.floor(input.ticketCount) || 1);
    const oneCodeMessage = ticketCount === 1
      ? "One code covers the ticket in this reservation."
      : `One code covers all ${ticketCount} tickets in this reservation.`;
    const presentCodeMessage = ticketCount === 1
      ? "Present this code at the door."
      : "Present this code once at the door. It will check in all tickets included in this reservation.";
    const assignedSeats = (input.assignedSeatLabels ?? []).filter((value) => value.trim());
    const seatLine = assignedSeats.length ? `<p style="margin:10px 0 0;color:#334155;font-size:14px;line-height:1.6;"><strong>Seats:</strong> ${escapeHtml(assignedSeats.join(", "))}</p>` : "";
    const barcodeImageSrc = imageSources ? imageSources.barcodeImageSrc : display.code128DataUri;
    const qrImageSrc = imageSources ? imageSources.qrImageSrc : display.qrDataUri;
    const ticketCodeHtml = barcodeImageSrc
      ? `<div style="margin-top:14px;text-align:center;"><img src="${escapeHtml(barcodeImageSrc)}" alt="Reservation barcode" width="300" style="display:block;width:100%;max-width:300px;height:auto;margin:0 auto;border:0;"></div>`
      : "";
    const qrHtml = qrImageSrc
      ? `<div style="text-align:center;"><img src="${escapeHtml(qrImageSrc)}" alt="Reservation QR code" width="200" height="200" style="display:block;width:100%;max-width:200px;height:auto;margin:0 auto;border:0;background:#ffffff;"></div>`
      : "";
    const layoutHtml = display.format === "both"
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td valign="top" width="50%" style="padding-right:8px;">${qrHtml}</td><td valign="middle" width="50%" style="padding-left:8px;">${ticketCodeHtml}</td></tr></table>`
      : qrHtml || ticketCodeHtml;

    return {
      html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;"><tr><td style="padding:18px;"><h2 style="margin:0 0 8px;color:#071426;font-size:18px;line-height:1.3;">YOUR ENTRY CODE</h2><p style="margin:0 0 6px;color:#0f172a;font-size:15px;font-weight:700;line-height:1.5;">${oneCodeMessage}</p><p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">${presentCodeMessage}</p>${layoutHtml}<p style="margin:14px 0 0;color:#334155;font-size:14px;line-height:1.6;"><strong>Ticket holder:</strong> ${escapeHtml(input.customerName.trim() || "Guest")}</p><p style="margin:6px 0 0;color:#334155;font-size:14px;line-height:1.6;"><strong>Tickets in this reservation:</strong> ${ticketCount}</p>${seatLine}</td></tr></table>`,
      text: [
        "YOUR ENTRY CODE",
        oneCodeMessage,
        presentCodeMessage,
        `Ticket holder: ${input.customerName.trim() || "Guest"}`,
        `Tickets in this reservation: ${ticketCount}`,
        ...(assignedSeats.length ? [`Seats: ${assignedSeats.join(", ")}`] : []),
        "",
      ].join("\n"),
    };
  } catch (error) {
    console.warn("Unable to render reservation ticket code for email.", error);
    return { html: "", text: "" };
  }
}

export function buildReservedSeatEmail(input: ReservedSeatEmailInput, logoSrc: string | null = CMMS_EMAIL_LOGO_SRC): ReservedSeatEmailContent {
  const count = Math.max(1, Math.floor(input.ticketCount) || 1);
  const subject = `Select Your Reserved Seats - ${RESERVED_SEAT_EMAIL_EVENT_NAME}`;
  const customerShowDate = formatCustomerShowDate(input.showDate);
  const safe = {
    customerName: escapeHtml(input.customerName.trim() || "Guest"),
    showName: escapeHtml(RESERVED_SEAT_EMAIL_EVENT_NAME),
    customerShowDate: escapeHtml(customerShowDate),
    showDate: escapeHtml(input.showDate.trim()),
    showTime: escapeHtml(input.showTime?.trim() ?? ""),
    venueName: escapeHtml(input.venueName.trim()),
    venueAddress: escapeHtml(input.venueAddress.trim()),
    seatSelectionUrl: escapeHtml(input.seatSelectionUrl.trim()),
    parkingInformation: escapeHtml(input.parkingInformation?.trim() || DEFAULT_RESERVED_SEAT_PARKING_INFORMATION),
  };
  const detailRows = [
    ["Show", safe.showName],
    ["Date", safe.showDate],
    ...(safe.showTime ? [["Time", safe.showTime]] : []),
    ["Venue", safe.venueName],
    ["Address", safe.venueAddress],
    ["Tickets Purchased", escapeHtml(ticketsPurchasedText(count))],
  ].map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;vertical-align:top;">${label}</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600;vertical-align:top;">${value}</td></tr>`).join("");
  const directionsUrl = buildGoogleMapsDirectionsUrl(input.venueName, input.venueAddress);
  const safeDirectionsUrl = directionsUrl ? escapeHtml(directionsUrl) : "";
  const safeAutoAssignUrl = escapeHtml(`${input.seatSelectionUrl.replace(/\/$/, "")}?preference=auto`);
  const directionsHtml = safeDirectionsUrl
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;"><tr><td style="padding:18px;"><h2 style="margin:0 0 12px;color:#071426;font-size:18px;line-height:1.3;">Directions</h2><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border:1px solid #0f3b5f;border-radius:5px;"><a href="${safeDirectionsUrl}" style="display:inline-block;padding:11px 18px;color:#0f3b5f;font-size:14px;font-weight:700;text-decoration:none;">Get Directions</a></td></tr></table><h2 style="margin:20px 0 8px;color:#071426;font-size:18px;line-height:1.3;">Parking Information</h2><p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">${safe.parkingInformation}</p></td></tr></table>`
    : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;"><tr><td style="padding:18px;"><h2 style="margin:0 0 8px;color:#071426;font-size:18px;line-height:1.3;">Parking Information</h2><p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">${safe.parkingInformation}</p></td></tr></table>`;
  const ticketCodeSection = buildTicketCodeSection(input, getTicketCodeEmailImageSources(input.ticketCodeFormat));
  const seatSelectionCodeReminder = input.scanToken?.trim()
    ? `<p style="margin:0 0 24px;padding:12px 14px;background:#fff7ed;border-left:4px solid #d89b2b;color:#334155;font-size:14px;line-height:1.6;"><strong>Your ticket code covers ${count === 1 ? "the ticket" : `all ${count} tickets`} in this reservation.</strong> You still need to choose your reserved ${count === 1 ? "seat" : "seats"} using the button above.</p>`
    : "";

  const autoAssignHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;"><tr><td align="center" style="padding:20px 18px;"><h2 style="margin:0 0 10px;color:#071426;font-size:20px;line-height:1.3;">Need a little help choosing your seats?</h2><p style="margin:0 auto 10px;max-width:500px;color:#334155;font-size:14px;line-height:1.6;">If you&#39;d rather not choose your seats online, we&#39;re happy to take care of it for you.</p><p style="margin:0 auto 18px;max-width:500px;color:#334155;font-size:14px;line-height:1.6;">Your advance ticket purchase already guarantees your reserved seats.</p><table role="presentation" cellspacing="0" cellpadding="0" align="center"><tr><td bgcolor="#0f3b5f" style="border-radius:5px;"><a href="${safeAutoAssignUrl}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">&#127903;&#65039; Choose My Seats for Me</a></td></tr></table></td></tr></table>`;
  const seatSelectionActionHtml = `<h2 style="margin:0 0 10px;text-align:center;color:#071426;font-size:22px;line-height:1.3;">&#128073; Next Step: Choose Your Reserved Seats</h2><p style="margin:0 0 24px;text-align:center;color:#334155;font-size:16px;line-height:1.6;">Your reserved seats have been purchased successfully.<br>Choose your exact seats now so we&#39;ll have everything ready when you arrive at the show.</p><table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 30px;"><tr><td bgcolor="#d89b2b" style="border-radius:5px;"><a href="${safe.seatSelectionUrl}" style="display:inline-block;padding:15px 24px;color:#071426;font-size:16px;font-weight:700;text-decoration:none;">Select Your Reserved Seats</a></td></tr></table>${autoAssignHtml}<p style="margin:0 0 18px;text-align:center;color:#334155;font-size:14px;line-height:1.5;">Your private seat-selection link will remain available until the day of the show.</p><p style="margin:0 0 8px;text-align:center;color:#475569;font-size:13px;line-height:1.5;">If the button does not work, use this private link:</p><p style="margin:0 0 22px;text-align:center;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${safe.seatSelectionUrl}" style="color:#075985;">${safe.seatSelectionUrl}</a></p><p style="margin:0 0 18px;font-size:16px;line-height:1.6;"><strong>${seatSelectionInstruction(count)}</strong> Once your seats are confirmed, they will be reserved for you.</p>`;

  const html = `<!doctype html><html><body style="margin:0;background:#e2e8f0;font-family:Arial,sans-serif;color:#0f172a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e2e8f0;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:8px;overflow:hidden;"><tr><td align="center" style="background:#071426;padding:24px;">${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="Cumberland Mountain Music Show" width="260" height="156" style="display:block;width:100%;max-width:260px;height:auto;border:0;"><div style="margin-top:10px;color:#fbbf24;font-size:16px;font-weight:700;">The Cumberland Mountain Music Show</div>` : `<div style="color:#fbbf24;font-size:20px;font-weight:700;">The Cumberland Mountain Music Show</div>`}</td></tr><tr><td style="padding:32px 28px;"><h1 style="margin:0 0 8px;text-align:center;color:#071426;font-size:28px;line-height:1.2;">Thank You for Your Purchase!</h1><p style="margin:0 0 22px;text-align:center;color:#a36b12;font-size:13px;font-weight:700;line-height:1.4;">Big-Time Show &bull; Small-Town Hospitality</p><p style="margin:0 0 18px;font-size:18px;font-weight:700;line-height:1.5;color:#071426;">Hi ${safe.customerName},</p><p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Thank you for purchasing ${reservedSeatPurchaseText(count)} for ${RESERVED_SEAT_EMAIL_EVENT_NAME}. We&#39;re looking forward to seeing you on ${safe.customerShowDate}!</p><p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Your payment has been received successfully. Click the button below to choose your reserved seats.</p>${seatSelectionActionHtml}<h2 style="margin:24px 0 10px;color:#071426;font-size:20px;line-height:1.3;">Reservation Details</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;"><tr><td style="padding:18px;"><table role="presentation" cellspacing="0" cellpadding="0">${detailRows}</table></td></tr></table>${ticketCodeSection.html}${seatSelectionCodeReminder}${directionsHtml}<h2 style="margin:24px 0 8px;color:#071426;font-size:20px;line-height:1.3;">Questions?</h2><p style="margin:0;font-size:16px;line-height:1.6;">Simply reply to this email or contact us at <a href="mailto:info@cumberlandmountainmusic.com" style="color:#075985;font-weight:700;">info@cumberlandmountainmusic.com</a>. We&#39;re happy to help.</p></td></tr><tr><td align="center" style="background:#071426;padding:32px 24px;color:#cbd5e1;font-size:13px;line-height:1.8;"><strong style="color:#ffffff;">The Cumberland Mountain Music Show</strong><br>Big-Time Show, Small-Town Hospitality<br><a href="https://www.cumberlandmountainmusic.com" style="color:#fbbf24;font-size:15px;font-weight:700;">www.cumberlandmountainmusic.com</a></td></tr></table></td></tr></table></body></html>`;


  const text = [
    "Thank You for Your Purchase!",
    "",
    `Hi ${input.customerName.trim() || "Guest"},`,
    "",
    `Thank you for purchasing ${reservedSeatPurchaseText(count)} for ${RESERVED_SEAT_EMAIL_EVENT_NAME}. We're looking forward to seeing you on ${customerShowDate}!`,
    "",
    "Your payment has been received successfully. Click the link below to choose your reserved seats.",
    "",
    "👉 Next Step: Choose Your Reserved Seats",
    "Your reserved seats have been purchased successfully.",
    "Choose your exact seats now so we'll have everything ready when you arrive at the show.",
    "",
    "Select Your Reserved Seats:",
    input.seatSelectionUrl.trim(),
    "",
    "Need a little help choosing your seats?",
    "If you'd rather not choose your seats online, we're happy to take care of it for you.",
    "Your advance ticket purchase already guarantees your reserved seats.",
    "🎟️ Choose My Seats for Me:",
    `${input.seatSelectionUrl.replace(/\/$/, "")}?preference=auto`,
    "",
    "Your private seat-selection link will remain available until the day of the show.",
    "",
    `${seatSelectionInstruction(count)} Once your seats are confirmed, they will be reserved for you.`,
    "",
    "Reservation Details:",
    `Show: ${RESERVED_SEAT_EMAIL_EVENT_NAME}`,
    `Date: ${input.showDate.trim()}`,
    ...(input.showTime?.trim() ? [`Time: ${input.showTime.trim()}`] : []),
    `Venue: ${input.venueName.trim()}`,
    `Address: ${input.venueAddress.trim()}`,
    `Tickets Purchased: ${ticketsPurchasedText(count)}`,
    "",
    ...(ticketCodeSection.text ? [ticketCodeSection.text] : []),
    ...(input.scanToken?.trim()
      ? [`Your ticket code covers ${count === 1 ? "the ticket" : `all ${count} tickets`} in this reservation. You still need to choose your reserved ${count === 1 ? "seat" : "seats"} using the link above.`, ""]
      : []),
    ...(directionsUrl ? ["Directions", "Get Directions:", directionsUrl, ""] : []),
    "Parking Information",
    input.parkingInformation?.trim() || DEFAULT_RESERVED_SEAT_PARKING_INFORMATION,
    "",
    "Questions?",
    "Simply reply to this email or contact us at info@cumberlandmountainmusic.com. We're happy to help.",
    "",
    "Thank you,",
    RESERVED_SEAT_EMAIL_EVENT_NAME,
    "Big-Time Show, Small-Town Hospitality",
    "www.cumberlandmountainmusic.com",
  ].join("\n");

  return { subject, html, text };
}

export async function sendReservedSeatEmail(input: ReservedSeatEmailInput): Promise<ReservedSeatEmailResult> {
  if (!validEmail(input.customerEmail)) return { success: false, resendId: null, error: "A valid customer email is required." };
  if (!isStageFlowPublicUrl(input.seatSelectionUrl)) return { success: false, resendId: null, error: "Seat-selection URL must use the configured StageFlow public URL." };
  if (!process.env.RESEND_API_KEY) return { success: false, resendId: null, error: "Email service is not configured." };

  try {
    const logoAsset = await loadCmmsEmailLogoAsset();
    const ticketCodeAssets = input.scanToken?.trim()
      ? await buildTicketCodeEmailAssets(input.scanToken, input.ticketCodeFormat)
      : null;
    const content = buildReservedSeatEmail(input, logoAsset?.src ?? null);
    const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: RESERVED_SEAT_EMAIL_FROM,
      replyTo: RESERVED_SEAT_EMAIL_REPLY_TO,
      to: input.customerEmail.trim(),
      subject: content.subject,
      html: content.html,
      text: content.text,
      attachments: [
        ...(logoAsset ? [logoAsset.attachment] : []),
        ...(ticketCodeAssets?.attachments ?? []),
      ],
    });
    if (error) {
      console.error("Reserved-seat email send failed.", { name: error.name, message: error.message });
      return { success: false, resendId: null, error: error.message || "Email delivery failed." };
    }
    return { success: true, resendId: data?.id ?? null, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed.";
    console.error("Reserved-seat email send failed.", { message });
    return { success: false, resendId: null, error: message };
  }
}

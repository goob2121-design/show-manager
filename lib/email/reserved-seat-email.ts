import { Resend } from "resend";

export const RESERVED_SEAT_EMAIL_FROM = "Cumberland Mountain Music Show <tickets@cumberlandmountainmusic.com>";
export const RESERVED_SEAT_EMAIL_REPLY_TO = "info@cumberlandmountainmusic.com";

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
  logoUrl?: string | null;
  categoryLabel?: string | null;
};

export type ReservedSeatEmailContent = { subject: string; html: string; text: string };
export type ReservedSeatEmailResult = { success: boolean; resendId: string | null; error: string | null };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validSeatUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:");
  } catch {
    return false;
  }
}

function ticketCountText(ticketCount: number) {
  const count = Math.max(1, Math.floor(ticketCount) || 1);
  return count === 1 ? "Please choose your reserved seat." : `Please choose your ${count} reserved seats.`;
}

export function buildReservedSeatEmail(input: ReservedSeatEmailInput): ReservedSeatEmailContent {
  const count = Math.max(1, Math.floor(input.ticketCount) || 1);
  const subject = `Select Your Reserved Seats - ${input.showName.trim()}`;
  const safe = {
    customerName: escapeHtml(input.customerName.trim() || "Guest"),
    showName: escapeHtml(input.showName.trim()),
    showDate: escapeHtml(input.showDate.trim()),
    showTime: escapeHtml(input.showTime?.trim() ?? ""),
    venueName: escapeHtml(input.venueName.trim()),
    venueAddress: escapeHtml(input.venueAddress.trim()),
    seatSelectionUrl: escapeHtml(input.seatSelectionUrl.trim()),
    logoUrl: escapeHtml(input.logoUrl?.trim() ?? ""),
  };
  const detailRows = [
    ["Show", safe.showName],
    ["Date", safe.showDate],
    ...(safe.showTime ? [["Time", safe.showTime]] : []),
    ["Venue", safe.venueName],
    ["Address", safe.venueAddress],
  ].map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;vertical-align:top;">${label}</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600;vertical-align:top;">${value}</td></tr>`).join("");

  const html = `<!doctype html><html><body style="margin:0;background:#e2e8f0;font-family:Arial,sans-serif;color:#0f172a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e2e8f0;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:8px;overflow:hidden;"><tr><td align="center" style="background:#071426;padding:24px;">${safe.logoUrl ? `<img src="${safe.logoUrl}" alt="Cumberland Mountain Music Show" width="260" style="display:block;width:100%;max-width:260px;height:auto;border:0;">` : `<div style="color:#fbbf24;font-size:20px;font-weight:700;">Cumberland Mountain Music Show</div>`}</td></tr><tr><td style="padding:32px 28px;"><h1 style="margin:0 0 22px;color:#071426;font-size:28px;line-height:1.2;">Thank You for Your Ticket Purchase!</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hi ${safe.customerName},</p><p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Thank you for purchasing <strong>${count} ticket${count === 1 ? "" : "s"}</strong> to the Cumberland Mountain Music Show!</p><p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Reserved seating is available for this show. Use your private link to select your seats.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;"><tr><td style="padding:18px;"><table role="presentation" cellspacing="0" cellpadding="0">${detailRows}</table></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" align="center"><tr><td bgcolor="#d89b2b" style="border-radius:5px;"><a href="${safe.seatSelectionUrl}" style="display:inline-block;padding:15px 24px;color:#071426;font-size:16px;font-weight:700;text-decoration:none;">Select Your Reserved Seats</a></td></tr></table><p style="margin:18px 0 8px;text-align:center;color:#475569;font-size:13px;line-height:1.5;">If the button does not work, use this private link:</p><p style="margin:0 0 22px;text-align:center;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${safe.seatSelectionUrl}" style="color:#075985;">${safe.seatSelectionUrl}</a></p><p style="margin:0 0 18px;font-size:16px;line-height:1.6;"><strong>${ticketCountText(count)}</strong> Once your seats are confirmed, they will be reserved for you.</p><p style="margin:0 0 18px;font-size:16px;line-height:1.6;">If you prefer not to select your seats, that's perfectly fine too. We'll be happy to reserve seats for you and have them ready when you arrive.</p><p style="margin:0;font-size:16px;line-height:1.6;">If you have any trouble, simply reply to this email.</p></td></tr><tr><td align="center" style="background:#071426;padding:24px;color:#cbd5e1;font-size:13px;line-height:1.7;"><strong style="color:#ffffff;">Cumberland Mountain Music Show</strong><br>Big-Time Show, Small-Town Hospitality<br><a href="https://www.cumberlandmountainmusic.com" style="color:#fbbf24;">www.cumberlandmountainmusic.com</a></td></tr></table></td></tr></table></body></html>`;

  const text = [
    "Thank You for Your Ticket Purchase!",
    "",
    `Hi ${input.customerName.trim() || "Guest"},`,
    "",
    `Thank you for purchasing ${count} ticket${count === 1 ? "" : "s"} to the Cumberland Mountain Music Show!`,
    "",
    "Reserved seating is available for this show. You can select your seats using your private seat-selection link below:",
    input.seatSelectionUrl.trim(),
    "",
    "Show Information:",
    input.showName.trim(),
    input.showDate.trim(),
    ...(input.showTime?.trim() ? [input.showTime.trim()] : []),
    input.venueName.trim(),
    input.venueAddress.trim(),
    "",
    `${ticketCountText(count)} Once your seats are confirmed, they will be reserved for you.`,
    "",
    "If you prefer not to select your seats, that's perfectly fine too. We'll be happy to reserve seats for you and have them ready when you arrive.",
    "",
    "If you have any trouble, simply reply to this email.",
    "",
    "Thank you,",
    "Cumberland Mountain Music Show",
    "Big-Time Show, Small-Town Hospitality",
    "www.cumberlandmountainmusic.com",
  ].join("\n");

  return { subject, html, text };
}

export async function sendReservedSeatEmail(input: ReservedSeatEmailInput): Promise<ReservedSeatEmailResult> {
  if (!validEmail(input.customerEmail)) return { success: false, resendId: null, error: "A valid customer email is required." };
  if (!validSeatUrl(input.seatSelectionUrl)) return { success: false, resendId: null, error: "A valid seat-selection URL is required." };
  if (!process.env.RESEND_API_KEY) return { success: false, resendId: null, error: "Email service is not configured." };

  try {
    const content = buildReservedSeatEmail(input);
    const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: RESERVED_SEAT_EMAIL_FROM,
      replyTo: RESERVED_SEAT_EMAIL_REPLY_TO,
      to: input.customerEmail.trim(),
      subject: content.subject,
      html: content.html,
      text: content.text,
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

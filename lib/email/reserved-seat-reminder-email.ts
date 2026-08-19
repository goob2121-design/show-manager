import { Resend } from "resend";
import { RESERVED_SEAT_EMAIL_FROM, RESERVED_SEAT_EMAIL_REPLY_TO, type ReservedSeatEmailResult } from "@/lib/email/reserved-seat-email";
import { isStageFlowPublicUrl } from "@/lib/server/stageflow-public-url";

export const RESERVED_SEAT_REMINDER_SUBJECT = "Reminder: Please Select Your Seats for the Cumberland Mountain Music Show";

export type ReservedSeatReminderEmailInput = {
  customerName: string;
  customerEmail: string;
  showName: string;
  showDate: string | null;
  remainingSeats: number;
  seatSelectionUrl: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatShowDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
}

export function buildReservedSeatReminderEmail(input: ReservedSeatReminderEmailInput) {
  const name = input.customerName.trim() || "Guest";
  const count = Math.max(1, Math.floor(input.remainingSeats) || 1);
  const showDate = formatShowDate(input.showDate);
  const showLine = showDate ? `${input.showName} on ${showDate}` : input.showName;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #cbd5e1;border-radius:10px;"><tr><td style="padding:32px;"><p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hi ${escapeHtml(name)},</p><h1 style="margin:0 0 16px;color:#071426;font-size:26px;line-height:1.25;">A friendly reserved-seat reminder</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.6;">You still need to select ${count === 1 ? "your reserved seat" : `your ${count} remaining reserved seats`} for ${escapeHtml(showLine)}.</p><p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Your tickets are already purchased—you just need to choose where you&apos;d like to sit.</p><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#0f3b5f" style="border-radius:6px;"><a href="${escapeHtml(input.seatSelectionUrl)}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">Choose Your Seats</a></td></tr></table><p style="margin:24px 0 0;color:#475569;font-size:14px;line-height:1.6;">If you have already completed your seat selection, no additional action is needed.</p><p style="margin:24px 0 0;font-size:15px;line-height:1.6;">We look forward to seeing you at the show!</p><p style="margin:16px 0 0;font-size:15px;font-weight:700;">Cumberland Mountain Music Show</p></td></tr></table></td></tr></table></body></html>`;
  const text = [`Hi ${name},`, "", `Just a friendly reminder that you still need to select ${count === 1 ? "your reserved seat" : `your ${count} remaining reserved seats`} for ${showLine}.`, "", "Your tickets are already purchased—you just need to choose where you'd like to sit.", "", "Choose Your Seats:", input.seatSelectionUrl, "", "If you have already completed your seat selection, no additional action is needed.", "", "We look forward to seeing you at the show!", "", "Cumberland Mountain Music Show"].join("\n");
  return { subject: RESERVED_SEAT_REMINDER_SUBJECT, html, text };
}

export async function sendReservedSeatReminderEmail(input: ReservedSeatReminderEmailInput, options: { idempotencyKey: string; tags: Array<{ name: string; value: string }> }): Promise<ReservedSeatEmailResult> {
  if (!validEmail(input.customerEmail)) return { success: false, resendId: null, error: "A valid customer email is required." };
  if (!isStageFlowPublicUrl(input.seatSelectionUrl)) return { success: false, resendId: null, error: "Seat-selection URL must use the configured StageFlow public URL." };
  if (!process.env.RESEND_API_KEY) return { success: false, resendId: null, error: "Email service is not configured." };
  const content = buildReservedSeatReminderEmail(input);
  try {
    const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: RESERVED_SEAT_EMAIL_FROM, replyTo: RESERVED_SEAT_EMAIL_REPLY_TO, to: input.customerEmail.trim(), subject: content.subject, html: content.html, text: content.text, tags: options.tags }, { idempotencyKey: options.idempotencyKey });
    if (error) return { success: false, resendId: null, error: error.message || "Email delivery failed." };
    return { success: true, resendId: data?.id ?? null, error: null };
  } catch (error) {
    return { success: false, resendId: null, error: error instanceof Error ? error.message : "Email delivery failed." };
  }
}

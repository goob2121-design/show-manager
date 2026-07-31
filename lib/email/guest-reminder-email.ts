import { Resend } from "resend";
import type { GuestReminderEmailContent } from "@/lib/email/guest-reminder-email-content";
import { RESERVED_SEAT_EMAIL_FROM, RESERVED_SEAT_EMAIL_REPLY_TO } from "@/lib/email/reserved-seat-email";

export async function sendGuestReminderEmail(content: GuestReminderEmailContent) {
  if (!process.env.RESEND_API_KEY) return { success: false as const, error: "Email service is not configured." };
  try {
    const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: RESERVED_SEAT_EMAIL_FROM,
      replyTo: RESERVED_SEAT_EMAIL_REPLY_TO,
      to: content.recipient,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    if (error) {
      if (process.env.NODE_ENV !== "production") throw error;
      return { success: false as const, error: error.message || "Email delivery failed." };
    }
    return { success: true as const, resendId: data?.id ?? null };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") throw error;
    return { success: false as const, error: error instanceof Error ? error.message : "Email delivery failed." };
  }
}

import { Resend } from "resend";
import { MAILING_LIST_WELCOME_SENDER } from "@/lib/mailing-list-welcome-email";

export const MAILING_LIST_ADMIN_NOTIFICATION_SUBJECT = "New CMMS Mailing List Subscriber";

type NotificationClient = {
  emails: {
    send: (
      payload: { from: string; to: string; subject: string; html: string; text: string },
      options: { idempotencyKey: string },
    ) => Promise<{ data?: { id?: string | null } | null; error?: { message?: string | null } | null }>;
  };
};

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function sourceLabel(source: string) {
  if (source === "ticket_opt_in") return "Ticket Opt-In";
  if (source === "admin") return "Admin";
  if (source === "import") return "Import";
  if (source === "website") return "Website";
  return "Other";
}

function formatSignedUpAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "America/New_York" }).format(date);
}

export function buildMailingListAdminNotification(input: {
  firstName: string;
  lastName: string;
  email: string;
  source: string;
  signedUpAt: string;
  presaleDeliveryStatus?: "sent" | "failed" | null;
}) {
  const fullName = [input.firstName.trim(), input.lastName.trim()].filter(Boolean).join(" ") || "Name not provided";
  const source = sourceLabel(input.source);
  const signedUpAt = formatSignedUpAt(input.signedUpAt);
  const presaleLabel = input.presaleDeliveryStatus === "sent" ? "Sent" : input.presaleDeliveryStatus === "failed" ? "Failed" : null;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><h2>New Mailing List Signup</h2><p><strong>${escapeHtml(fullName)}</strong><br><a href="mailto:${escapeHtml(input.email)}">${escapeHtml(input.email)}</a></p><p><strong>Source:</strong> ${escapeHtml(source)}<br><strong>Signed up:</strong> ${escapeHtml(signedUpAt)}${presaleLabel ? `<br><strong>Presale Access Email:</strong> ${presaleLabel}` : ""}</p></div>`;
  const text = `New Mailing List Signup\n\n${fullName}\n${input.email}\n\nSource: ${source}\nSigned up: ${signedUpAt}${presaleLabel ? `\nPresale Access Email: ${presaleLabel}` : ""}`;
  return { html, text };
}

export async function sendMailingListAdminNotification(
  input: {
    subscriberId: string;
    subscriptionEvent: "new" | "resubscribe";
    firstName: string;
    lastName: string;
    email: string;
    source: string;
    signedUpAt: string;
    presaleDeliveryStatus?: "sent" | "failed" | null;
    apiKey: string | undefined;
    recipient: string | undefined;
  },
  clientFactory: (apiKey: string) => NotificationClient = (apiKey) => new Resend(apiKey),
) {
  if (!input.apiKey || !input.recipient?.trim()) return { sent: false, skipped: true, errorMessage: "Admin notification is not configured." };
  try {
    const content = buildMailingListAdminNotification(input);
    const eventKey = input.subscriptionEvent === "new" ? "new" : `resubscribe-${input.signedUpAt.slice(0, 10)}`;
    const result = await clientFactory(input.apiKey).emails.send({
      from: MAILING_LIST_WELCOME_SENDER.from,
      to: input.recipient.trim(),
      subject: MAILING_LIST_ADMIN_NOTIFICATION_SUBJECT,
      html: content.html,
      text: content.text,
    }, { idempotencyKey: `mailing-list-admin-${input.subscriberId}-${eventKey}` });
    if (result.error) return { sent: false, skipped: false, errorMessage: result.error.message ?? "Admin notification failed." };
    return { sent: true, skipped: false, resendMessageId: result.data?.id ?? null };
  } catch (error) {
    return { sent: false, skipped: false, errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Admin notification failed." };
  }
}

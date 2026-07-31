import type { GuestReminderItem } from "@/lib/guest-reminder";

export const GUEST_REMINDER_SUBJECT = "Items Needed for the Cumberland Mountain Music Show";

export type GuestReminderEmailContent = {
  subject: string;
  recipient: string;
  missingItems: GuestReminderItem[];
  portalUrl: string;
  text: string;
  html: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export function buildGuestReminderEmail(input: {
  email: string;
  guestName: string;
  portalUrl: string;
  missingItems: GuestReminderItem[];
  additionalNote?: string | null;
}): GuestReminderEmailContent {
  const name = input.guestName.trim() || "Guest";
  const note = input.additionalNote?.trim() ?? "";
  const hasMissingItems = input.missingItems.length > 0;
  const missingText = input.missingItems.map((item) => `• ${item}`).join("\n");
  const missingHtml = `<ul style="margin:0 0 20px;padding-left:24px;">${input.missingItems.map((item) => `<li style="margin:6px 0;">${escapeHtml(item)}</li>`).join("")}</ul>`;
  const statusText = hasMissingItems
    ? `We're still waiting on:\n\n${missingText}`
    : "Great news!\n\nWe've received everything we need from you.\n\nIf you'd like to review or update your information before the show, you can still access your Guest Portal below.";
  const statusHtml = hasMissingItems
    ? `<p style="margin:0 0 10px;font-weight:700;">We&#39;re still waiting on:</p>${missingHtml}`
    : `<p style="margin:0 0 14px;font-size:18px;font-weight:700;">Great news!</p><p style="margin:0 0 18px;">We&#39;ve received everything we need from you.</p><p style="margin:0 0 18px;">If you&#39;d like to review or update your information before the show, you can still access your Guest Portal below.</p>`;
  const noteText = note ? `\nAdditional Note\n\n${note}\n` : "";
  const noteHtml = note ? `<div style="margin:0 0 20px;padding:16px;background:#f8fafc;border-left:4px solid #d89b2b;"><strong>Additional Note</strong><p style="margin:8px 0 0;white-space:pre-wrap;">${escapeHtml(note)}</p></div>` : "";
  const text = `Hi ${name},

We're looking forward to having you as our guest.

${statusText}
${noteText}
${hasMissingItems ? "You can submit everything using your Guest Portal:" : "Guest Portal:"}

${input.portalUrl}

We appreciate your help and look forward to seeing you.

—
Bryan Turner
Cumberland Mountain Music Show`;
  const html = `<!doctype html><html><body style="margin:0;background:#e2e8f0;font-family:Arial,sans-serif;color:#0f172a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background:#071426;padding:24px;text-align:center;color:#fbbf24;font-size:22px;font-weight:700;">Cumberland Mountain Music Show</td></tr><tr><td style="padding:30px 28px;"><p style="margin:0 0 18px;font-size:18px;font-weight:700;">Hi ${escapeHtml(name)},</p><p style="margin:0 0 18px;">We&#39;re looking forward to having you as our guest.</p>${statusHtml}${noteHtml}${hasMissingItems ? '<p style="margin:0 0 12px;">You can submit everything using your Guest Portal:</p>' : ""}<p style="margin:0 0 24px;"><a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;padding:12px 18px;background:#d89b2b;color:#071426;font-weight:700;text-decoration:none;border-radius:5px;">Open Your Guest Portal</a></p><p style="margin:0 0 20px;">We appreciate your help and look forward to seeing you.</p><p style="margin:0;">—<br>Bryan Turner<br>Cumberland Mountain Music Show</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: GUEST_REMINDER_SUBJECT, recipient: input.email.trim(), missingItems: input.missingItems, portalUrl: input.portalUrl, text, html };
}
import type { SupportedResendEmailEventType } from "./reserved-seat-email-tracking";

export type MailingListPresaleDeliveryEvent = {
  id: string;
  resend_message_id: string;
  event_type: SupportedResendEmailEventType;
  provider_occurred_at: string;
  received_at: string;
  recipient: string | null;
  clicked_url: string | null;
  detail: string | null;
};

export type MailingListPresaleTrackingLine = { label: string; timestamp: string | null };

const PRECEDENCE: SupportedResendEmailEventType[] = [
  "email.complained", "email.bounced", "email.failed", "email.delivery_delayed",
  "email.clicked", "email.opened", "email.delivered", "email.sent",
];

export function mailingListPresaleEventLabel(type: SupportedResendEmailEventType) {
  switch (type) {
    case "email.sent": return "Sent";
    case "email.delivered": return "Delivered";
    case "email.delivery_delayed": return "Delivery Delayed";
    case "email.opened": return "Opened (estimated)";
    case "email.clicked": return "Clicked";
    case "email.bounced": return "Bounced";
    case "email.complained": return "Reported as Spam";
    case "email.failed": return "Failed";
  }
}

export function deriveMailingListPresaleTracking(input: {
  sendStatus: "pending" | "accepted" | "failed";
  sentAt: string | null;
  failedAt: string | null;
  events: MailingListPresaleDeliveryEvent[];
}) {
  const events = [...input.events].sort((a, b) =>
    new Date(a.provider_occurred_at).getTime() - new Date(b.provider_occurred_at).getTime());
  const hasProviderSent = events.some((event) => event.event_type === "email.sent");
  const history: MailingListPresaleTrackingLine[] = [
    ...(input.sentAt && !hasProviderSent ? [{ label: "Accepted by Resend", timestamp: input.sentAt }] : []),
    ...(input.sendStatus === "failed" && input.failedAt ? [{ label: "Failed", timestamp: input.failedAt }] : []),
    ...events.map((event) => ({ label: mailingListPresaleEventLabel(event.event_type), timestamp: event.provider_occurred_at })),
  ].sort((a, b) => new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime());

  const topEvent = PRECEDENCE
    .map((type) => events.filter((event) => event.event_type === type).at(-1) ?? null)
    .find((event): event is MailingListPresaleDeliveryEvent => Boolean(event));
  if (topEvent) return { currentLabel: mailingListPresaleEventLabel(topEvent.event_type), currentTimestamp: topEvent.provider_occurred_at, history };
  if (input.sendStatus === "failed") return { currentLabel: "Failed", currentTimestamp: input.failedAt, history };
  if (input.sendStatus === "accepted") return { currentLabel: "Sent", currentTimestamp: input.sentAt, history };
  return { currentLabel: "Sending", currentTimestamp: null, history };
}

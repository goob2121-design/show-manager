export const SUPPORTED_RESEND_EMAIL_EVENT_TYPES = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.complained",
  "email.bounced",
  "email.opened",
  "email.clicked",
  "email.failed",
] as const;

export type SupportedResendEmailEventType = (typeof SUPPORTED_RESEND_EMAIL_EVENT_TYPES)[number];

export type ReservedSeatEmailClickTarget =
  | "seat_selection"
  | "venue_link"
  | "website_link"
  | "other_link";

export type ReservedSeatEmailEventRecord = {
  id: string;
  resend_email_id: string;
  reserved_seating_link_id: string | null;
  event_type: SupportedResendEmailEventType;
  event_created_at: string;
  received_at: string;
  recipient: string | null;
  click_target: ReservedSeatEmailClickTarget | null;
  raw_event_id: string | null;
};

export type ReservedSeatEmailTrackingLine = {
  label: string;
  timestamp: string | null;
};

export type ReservedSeatEmailTrackingSummary = {
  prominentLabel: string;
  prominentTimestamp: string | null;
  history: ReservedSeatEmailTrackingLine[];
  trackingAvailable: boolean;
};

const EMAIL_SEND_CLAIM_PREFIX = "sending:";
const LEGACY_SENT_MARKER_PREFIX = "sent:";

const TRACKED_EMAIL_PRECEDENCE: SupportedResendEmailEventType[] = [
  "email.complained",
  "email.bounced",
  "email.failed",
  "email.delivery_delayed",
  "email.clicked",
  "email.opened",
  "email.delivered",
  "email.sent",
] as const;

export function isSupportedResendEmailEventType(value: string): value is SupportedResendEmailEventType {
  return (SUPPORTED_RESEND_EMAIL_EVENT_TYPES as readonly string[]).includes(value);
}

export function isTrackableResendEmailId(resendEmailId: string | null | undefined) {
  if (!resendEmailId?.trim()) return false;
  return !resendEmailId.startsWith(EMAIL_SEND_CLAIM_PREFIX) && !resendEmailId.startsWith(LEGACY_SENT_MARKER_PREFIX);
}

export function classifyReservedSeatEmailClickTarget(rawUrl: string | null | undefined): ReservedSeatEmailClickTarget | null {
  if (!rawUrl?.trim()) return null;

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (path.startsWith("/reserved-seating/")) {
      return "seat_selection";
    }

    if (
      host.includes("google.com")
      || host.includes("maps.apple.com")
      || host.includes("mapquest.com")
    ) {
      return "venue_link";
    }

    if (host.endsWith("cumberlandmountainmusic.com")) {
      return "website_link";
    }

    return "other_link";
  } catch {
    return "other_link";
  }
}

export function getReservedSeatEmailStatusLabel(
  eventType: SupportedResendEmailEventType,
  clickTarget: ReservedSeatEmailClickTarget | null,
) {
  switch (eventType) {
    case "email.sent":
      return "Sent";
    case "email.delivered":
      return "Delivered";
    case "email.opened":
      return "Opened (estimated)";
    case "email.clicked":
      switch (clickTarget) {
        case "seat_selection":
          return "Seat Link Clicked";
        case "venue_link":
          return "Venue Link Clicked";
        case "website_link":
          return "Website Link Clicked";
        default:
          return "Other Link Clicked";
      }
    case "email.bounced":
      return "Bounced";
    case "email.complained":
      return "Reported as Spam";
    case "email.delivery_delayed":
      return "Delivery Delayed";
    case "email.failed":
      return "Failed";
    default:
      return "Sent";
  }
}

function dedupeTrackingLines(lines: ReservedSeatEmailTrackingLine[]) {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = `${line.label}|${line.timestamp ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function deriveReservedSeatEmailTrackingSummary(input: {
  sentAt: string | null;
  resendEmailId: string | null;
  events: ReservedSeatEmailEventRecord[];
}): ReservedSeatEmailTrackingSummary {
  const sortedEvents = [...input.events].sort((left, right) => (
    new Date(left.event_created_at).getTime() - new Date(right.event_created_at).getTime()
  ));

  const history = dedupeTrackingLines([
    ...(input.sentAt ? [{ label: "Sent", timestamp: input.sentAt }] : []),
    ...sortedEvents.map((event) => ({
      label: getReservedSeatEmailStatusLabel(event.event_type, event.click_target),
      timestamp: event.event_created_at,
    })),
  ]);

  if (!input.sentAt && !input.resendEmailId) {
    return {
      prominentLabel: "Not Sent",
      prominentTimestamp: null,
      history: [],
      trackingAvailable: false,
    };
  }

  if (!isTrackableResendEmailId(input.resendEmailId)) {
    return {
      prominentLabel: input.sentAt ? "Tracking unavailable" : "Sending in progress",
      prominentTimestamp: input.sentAt,
      history,
      trackingAvailable: false,
    };
  }

  const topEvent = [...TRACKED_EMAIL_PRECEDENCE]
    .map((eventType) => sortedEvents.filter((event) => event.event_type === eventType).at(-1) ?? null)
    .find((event): event is ReservedSeatEmailEventRecord => Boolean(event));

  if (!topEvent) {
    return {
      prominentLabel: input.sentAt ? "Sent" : "Tracking unavailable",
      prominentTimestamp: input.sentAt,
      history,
      trackingAvailable: true,
    };
  }

  return {
    prominentLabel: getReservedSeatEmailStatusLabel(topEvent.event_type, topEvent.click_target),
    prominentTimestamp: topEvent.event_created_at,
    history,
    trackingAvailable: true,
  };
}

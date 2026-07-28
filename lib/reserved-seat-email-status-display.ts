import type {
  ReservedSeatEmailTrackingLine,
  ReservedSeatEmailTrackingSummary,
} from "./reserved-seat-email-tracking";

export type ReservedSeatEmailTrackingRequestState = "idle" | "loading" | "loaded" | "error";
export type ReservedSeatEmailStatusTone = "blue" | "green" | "cyan" | "gold" | "orange" | "purple" | "neutral" | "amber" | "red";

export type ReservedSeatEmailStatusVisual = {
  icon: string;
  tone: ReservedSeatEmailStatusTone;
};

export type ReservedSeatEmailStatusDisplayModel = {
  prominentLabel: string;
  prominentTimestamp: string | null;
  history: ReservedSeatEmailTrackingLine[];
  showHistory: boolean;
  showRetryButton: boolean;
  secondaryMessage: string | null;
  statusTone: ReservedSeatEmailStatusTone;
  statusIcon: string;
  showCompactBadge: boolean;
  compactBadgeLabel: string;
};

export const RESERVED_SEAT_EMAIL_TIME_ZONE = "America/New_York";

export function getReservedSeatEmailStatusVisual(label: string): ReservedSeatEmailStatusVisual {
  switch (label) {
    case "Sent":
      return { icon: "📧", tone: "blue" };
    case "Delivered":
      return { icon: "📬", tone: "green" };
    case "Opened (estimated)":
      return { icon: "👁", tone: "cyan" };
    case "Seat Link Clicked":
      return { icon: "🎟", tone: "gold" };
    case "Venue Link Clicked":
      return { icon: "📍", tone: "orange" };
    case "Website Link Clicked":
      return { icon: "🌐", tone: "purple" };
    case "Other Link Clicked":
      return { icon: "🔗", tone: "neutral" };
    case "Delivery Delayed":
      return { icon: "⏱", tone: "amber" };
    case "Failed":
      return { icon: "⛔", tone: "red" };
    case "Bounced":
      return { icon: "↩", tone: "red" };
    case "Reported as Spam":
      return { icon: "⚠", tone: "red" };
    case "Loading email tracking…":
    case "Sending in progress":
      return { icon: "⏳", tone: "neutral" };
    case "Tracking status could not be loaded":
      return { icon: "⚠", tone: "amber" };
    case "Tracking unavailable":
      return { icon: "ℹ", tone: "neutral" };
    case "Not Sent":
      return { icon: "📧", tone: "amber" };
    default:
      return { icon: "ℹ", tone: "neutral" };
  }
}

function zonedDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESERVED_SEAT_EMAIL_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function calendarDayNumber(parts: ReturnType<typeof zonedDateParts>) {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

export function formatReservedSeatEmailTimestamp(value: string | null, now: Date = new Date()) {
  if (!value) return "";
  const eventDate = new Date(value);
  if (Number.isNaN(eventDate.getTime())) return value;

  const eventParts = zonedDateParts(eventDate);
  const nowParts = zonedDateParts(now);
  const dayDifference = calendarDayNumber(nowParts) - calendarDayNumber(eventParts);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: RESERVED_SEAT_EMAIL_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(eventDate);

  if (dayDifference === 0) return `Today at ${time}`;
  if (dayDifference === 1) return `Yesterday at ${time}`;

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: RESERVED_SEAT_EMAIL_TIME_ZONE,
    month: "short",
    day: "numeric",
    ...(eventParts.year === nowParts.year ? {} : { year: "numeric" as const }),
  }).format(eventDate);
  return `${date} at ${time}`;
}

export function formatReservedSeatEmailFullTimestamp(value: string | null) {
  if (!value) return "";
  const eventDate = new Date(value);
  if (Number.isNaN(eventDate.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: RESERVED_SEAT_EMAIL_TIME_ZONE,
    dateStyle: "full",
    timeStyle: "short",
  }).format(eventDate);
}

function buildDisplayModel(input: {
  prominentLabel: string;
  prominentTimestamp: string | null;
  history: ReservedSeatEmailTrackingLine[];
  showHistory: boolean;
  showRetryButton: boolean;
  secondaryMessage: string | null;
  requestState: ReservedSeatEmailTrackingRequestState;
  compactBadgeLabel?: string;
}): ReservedSeatEmailStatusDisplayModel {
  const visual = getReservedSeatEmailStatusVisual(input.prominentLabel);
  return {
    prominentLabel: input.prominentLabel,
    prominentTimestamp: input.prominentTimestamp,
    history: input.history,
    showHistory: input.showHistory,
    showRetryButton: input.showRetryButton,
    secondaryMessage: input.secondaryMessage,
    statusTone: visual.tone,
    statusIcon: visual.icon,
    showCompactBadge: input.requestState !== "loading",
    compactBadgeLabel: input.compactBadgeLabel ?? input.prominentLabel,
  };
}

export function getReservedSeatEmailStatusDisplayModel(input: {
  emailStatus?: ReservedSeatEmailTrackingSummary | null;
  requestState: ReservedSeatEmailTrackingRequestState;
}): ReservedSeatEmailStatusDisplayModel {
  const emailStatus = input.emailStatus ?? null;

  if (emailStatus) {
    return buildDisplayModel({
      prominentLabel: emailStatus.prominentLabel,
      prominentTimestamp: emailStatus.prominentTimestamp,
      history: emailStatus.history,
      showHistory: emailStatus.history.length > 0,
      showRetryButton: input.requestState === "error",
      secondaryMessage: input.requestState === "error" ? "Tracking status could not be loaded" : null,
      requestState: input.requestState,
    });
  }

  if (input.requestState === "error") {
    return buildDisplayModel({
      prominentLabel: "Tracking status could not be loaded",
      prominentTimestamp: null,
      history: [],
      showHistory: false,
      showRetryButton: true,
      secondaryMessage: null,
      requestState: input.requestState,
      compactBadgeLabel: "Tracking Error",
    });
  }

  return buildDisplayModel({
    prominentLabel: "Loading email tracking…",
    prominentTimestamp: null,
    history: [],
    showHistory: false,
    showRetryButton: false,
    secondaryMessage: null,
    requestState: input.requestState,
  });
}

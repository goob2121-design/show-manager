import type {
  ReservedSeatEmailTrackingLine,
  ReservedSeatEmailTrackingSummary,
} from "./reserved-seat-email-tracking";

export type ReservedSeatEmailTrackingRequestState = "idle" | "loading" | "loaded" | "error";

export type ReservedSeatEmailStatusDisplayModel = {
  prominentLabel: string;
  prominentTimestamp: string | null;
  history: ReservedSeatEmailTrackingLine[];
  showHistory: boolean;
  showRetryButton: boolean;
  secondaryMessage: string | null;
  statusTone: "success" | "warning" | "neutral";
};

export function getReservedSeatEmailStatusDisplayModel(input: {
  emailStatus?: ReservedSeatEmailTrackingSummary | null;
  requestState: ReservedSeatEmailTrackingRequestState;
}): ReservedSeatEmailStatusDisplayModel {
  const emailStatus = input.emailStatus ?? null;

  if (emailStatus) {
    return {
      prominentLabel: emailStatus.prominentLabel,
      prominentTimestamp: emailStatus.prominentTimestamp,
      history: emailStatus.history,
      showHistory: emailStatus.history.length > 0,
      showRetryButton: input.requestState === "error",
      secondaryMessage: input.requestState === "error" ? "Tracking status could not be loaded" : null,
      statusTone:
        emailStatus.prominentLabel === "Not Sent"
          ? "warning"
          : emailStatus.prominentLabel === "Tracking unavailable"
            ? "neutral"
            : "success",
    };
  }

  if (input.requestState === "error") {
    return {
      prominentLabel: "Tracking status could not be loaded",
      prominentTimestamp: null,
      history: [],
      showHistory: false,
      showRetryButton: true,
      secondaryMessage: null,
      statusTone: "neutral",
    };
  }

  return {
    prominentLabel: "Loading email tracking…",
    prominentTimestamp: null,
    history: [],
    showHistory: false,
    showRetryButton: false,
    secondaryMessage: null,
    statusTone: "neutral",
  };
}

export const DOOR_WELCOME_EVENT_VERSION = 1 as const;
export const DOOR_WELCOME_MESSAGE_TYPE = "guest-welcome" as const;
export const DOOR_WELCOME_IDLE_TIMEOUT_MS = 10_000;
export const DOOR_WELCOME_WINDOW_NAME = "stageflow-door-welcome-display";

export type DoorWelcomeEvent = {
  version: typeof DOOR_WELCOME_EVENT_VERSION;
  messageType: typeof DOOR_WELCOME_MESSAGE_TYPE;
  showSlug: string;
  displayName: string | null;
  quantityCheckedIn: number;
  ticketQuantity: number | null;
  checkedInTotal: number | null;
  assignedSeatLabels: string[];
  admissionCategory: string;
  timestamp: number;
};

export function doorWelcomeChannelName(showSlug: string) {
  return `stageflow-door-welcome:${showSlug}`;
}

export function createDoorWelcomeEvent(input: Omit<DoorWelcomeEvent, "version" | "messageType" | "timestamp">) {
  return {
    version: DOOR_WELCOME_EVENT_VERSION,
    messageType: DOOR_WELCOME_MESSAGE_TYPE,
    timestamp: Date.now(),
    ...input,
    assignedSeatLabels: [...input.assignedSeatLabels],
  } satisfies DoorWelcomeEvent;
}

export function publishDoorWelcomeEvent(
  showSlug: string,
  event: DoorWelcomeEvent,
  BroadcastChannelConstructor: typeof BroadcastChannel | null | undefined =
    typeof BroadcastChannel === "undefined" ? undefined : BroadcastChannel,
) {
  if (!BroadcastChannelConstructor) return false;
  try {
    const channel = new BroadcastChannelConstructor(doorWelcomeChannelName(showSlug));
    channel.postMessage(event);
    channel.close();
    return true;
  } catch {
    return false;
  }
}

export function openDoorWelcomeDisplay(
  showSlug: string,
  openWindow: typeof window.open = window.open.bind(window),
) {
  const displayWindow = openWindow(
    `/admin/${encodeURIComponent(showSlug)}/door/welcome-display`,
    DOOR_WELCOME_WINDOW_NAME,
  );
  displayWindow?.focus();
  return displayWindow;
}

export function doorWelcomeQuantityText(event: DoorWelcomeEvent) {
  const noun = event.quantityCheckedIn === 1 ? "Guest" : "Guests";
  const verb = event.admissionCategory === "Paid Door" ? "Admitted" : "Checked In";
  return `${event.quantityCheckedIn} ${noun} ${verb}`;
}

export function doorWelcomeProgressText(event: DoorWelcomeEvent) {
  if (
    event.admissionCategory !== "Paid Door" &&
    event.ticketQuantity &&
    event.ticketQuantity > event.quantityCheckedIn &&
    event.checkedInTotal !== null
  ) {
    return `${event.checkedInTotal} of ${event.ticketQuantity} Guests Checked In`;
  }
  return doorWelcomeQuantityText(event);
}

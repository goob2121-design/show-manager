export const WELCOME_DISPLAY_TIME_ZONE = "America/New_York";

export type TimedIdleWindow = "normal" | "doors-open-soon" | "post-show";

export const BASE_IDLE_MESSAGES = [
  "Welcome to the Cumberland Mountain Music Show",
  "Thank You to Our Sponsors",
  "Enjoy Tonight’s Show",
  "We’re Glad You’re Here",
] as const;

export const DOORS_OPEN_SOON_HEADLINE = "Doors Open Soon";
export const POST_SHOW_HEADLINE = "Thank You For Joining Us Tonight";

export function resolveTimedIdleWindow(now: number | Date): TimedIdleWindow {
  const date = typeof now === "number" ? new Date(now) : now;
  const hourPart = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: WELCOME_DISPLAY_TIME_ZONE,
  }).formatToParts(date).find((part) => part.type === "hour");
  const hour = Number.parseInt(hourPart?.value ?? "", 10);
  if (hour === 17) return "doors-open-soon";
  if (hour >= 21 && hour < 23) return "post-show";
  return "normal";
}

export function buildTimedIdleMessages(window: TimedIdleWindow) {
  if (window === "doors-open-soon") {
    return [...BASE_IDLE_MESSAGES, DOORS_OPEN_SOON_HEADLINE];
  }
  if (window === "post-show") {
    return [...BASE_IDLE_MESSAGES, POST_SHOW_HEADLINE];
  }
  return [...BASE_IDLE_MESSAGES];
}

export function chunkDoorWelcomeSeats(labels: readonly string[], maximumPerLine = 6) {
  const lines: string[][] = [];
  for (let index = 0; index < labels.length; index += maximumPerLine) {
    lines.push(labels.slice(index, index + maximumPerLine));
  }
  return lines;
}

export function doorWelcomeGuestCount(quantity: number) {
  return `${quantity} ${quantity === 1 ? "Guest" : "Guests"}`;
}
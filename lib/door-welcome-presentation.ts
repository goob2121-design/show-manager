export const WELCOME_DISPLAY_TIME_ZONE = "America/New_York";

export type TimedIdleWindow = "normal" | "doors-open-soon" | "post-show";

export type GuestIdleSlideSource = {
  name: string | null;
  photo_url: string | null;
  is_confirmed: boolean;
  permission_granted: boolean;
};

export type IdleSlide =
  | { kind: "message"; headline: string }
  | { kind: "guest"; name: string; photoUrl: string | null }
  | { kind: "sponsor"; headline: string };

export const BASE_IDLE_MESSAGES = [
  "Welcome to the Cumberland Mountain Music Show",
  "Thank You to Our Sponsors",
  "Enjoy Tonight's Show",
  "Thank You for Supporting Live Music",
  "Be Sure to Visit Our Concession Stand",
  "Thanks for Spending Your Evening With Us",
  "Proudly Supported By",
  "Thank You for Being Part of the CMMS Family",
] as const;

export const SPONSOR_IDLE_MESSAGES = [
  "Thank You to Our Sponsors",
  "Proudly Supported By",
] as const;

export const DOORS_OPEN_SOON_HEADLINE = "Doors Open Soon";
export const POST_SHOW_HEADLINE = "Thank You For Joining Us Tonight";

function messageIdleSlide(headline: string): IdleSlide {
  return (SPONSOR_IDLE_MESSAGES as readonly string[]).includes(headline)
    ? { kind: "sponsor", headline }
    : { kind: "message", headline };
}

export function buildGuestIdleSlides(profiles: readonly GuestIdleSlideSource[]): IdleSlide[] {
  return profiles.flatMap((profile) => {
    const name = profile.name?.trim();
    if (!profile.is_confirmed || !profile.permission_granted || !name) return [];
    return [{ kind: "guest", name, photoUrl: profile.photo_url?.trim() || null }];
  });
}

export function isSponsorIdleSlide(slide: IdleSlide) {
  return slide.kind === "sponsor";
}

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

export function buildTimedIdleSlides(window: TimedIdleWindow, guestSlides: readonly IdleSlide[] = []) {
  const slides = BASE_IDLE_MESSAGES.map(messageIdleSlide);
  guestSlides.forEach((guestSlide, index) => {
    slides.splice(Math.min(1 + (index * 2), slides.length), 0, guestSlide);
  });
  if (window === "doors-open-soon") slides.push(messageIdleSlide(DOORS_OPEN_SOON_HEADLINE));
  if (window === "post-show") slides.push(messageIdleSlide(POST_SHOW_HEADLINE));
  return slides;
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
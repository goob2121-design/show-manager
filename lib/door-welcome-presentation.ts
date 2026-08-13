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
  | { kind: "sponsor"; headline: string; name?: string; logoUrl?: string };

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

export type SponsorIdleSlideSource = {
  name: string;
  logoUrl: string;
};

export function shuffleSponsorQueue(
  sponsors: readonly SponsorIdleSlideSource[],
  previousLogoUrl: string | null = null,
  random: () => number = Math.random,
) {
  const queue = [...sponsors];
  for (let index = queue.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [queue[index], queue[swapIndex]] = [queue[swapIndex], queue[index]];
  }
  if (queue.length > 1 && queue[0]?.logoUrl === previousLogoUrl) {
    const replacementIndex = queue.findIndex((sponsor) => sponsor.logoUrl !== previousLogoUrl);
    if (replacementIndex > 0) [queue[0], queue[replacementIndex]] = [queue[replacementIndex], queue[0]];
  }
  return queue;
}

export function buildBalancedIdleSlides(
  window: TimedIdleWindow,
  guestSlides: readonly IdleSlide[],
  sponsorQueue: readonly SponsorIdleSlideSource[],
) {
  if (sponsorQueue.length === 0) return buildTimedIdleSlides(window, guestSlides);

  const messages: IdleSlide[] = BASE_IDLE_MESSAGES
    .filter((headline) => !(SPONSOR_IDLE_MESSAGES as readonly string[]).includes(headline))
    .map((headline) => ({ kind: "message", headline }) satisfies IdleSlide);
  if (window === "doors-open-soon") messages.push({ kind: "message", headline: DOORS_OPEN_SOON_HEADLINE });
  if (window === "post-show") messages.push({ kind: "message", headline: POST_SHOW_HEADLINE });

  const slides: IdleSlide[] = [];
  const welcomeSlide = messages.shift();
  if (welcomeSlide) slides.push(welcomeSlide);
  const sponsorAppearanceCount = Math.max(
    sponsorQueue.length,
    Math.ceil(messages.length / 2),
    guestSlides.length * 3,
  );
  let guestIndex = 0;

  for (let sponsorIndex = 0; sponsorIndex < sponsorAppearanceCount; sponsorIndex += 1) {
    const sponsor = sponsorQueue[sponsorIndex % sponsorQueue.length];
    slides.push({
      kind: "sponsor",
      headline: SPONSOR_IDLE_MESSAGES[sponsorIndex % SPONSOR_IDLE_MESSAGES.length],
      name: sponsor.name,
      logoUrl: sponsor.logoUrl,
    });

    const remainingSponsorSlots = sponsorAppearanceCount - sponsorIndex;
    const messagesThisSlot = Math.min(2, Math.ceil(messages.length / remainingSponsorSlots));
    slides.push(...messages.splice(0, messagesThisSlot));

    if (guestSlides.length > 0 && (sponsorIndex + 1) % 3 === 0) {
      slides.push(guestSlides[guestIndex % guestSlides.length]);
      guestIndex += 1;
    }
  }

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
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DOOR_WELCOME_IDLE_TIMEOUT_MS,
  DOOR_WELCOME_WINDOW_NAME,
  createDoorWelcomeEvent,
  doorWelcomeChannelName,
  doorWelcomeProgressText,
  openDoorWelcomeDisplay,
  publishDoorWelcomeEvent,
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "./door-welcome-display.ts";

const doorModePath = new URL("../app/components/door-mode-page.tsx", import.meta.url);
const displayPath = new URL("../app/components/door-welcome-display.tsx", import.meta.url);

function namedEvent(overrides: Partial<Parameters<typeof createDoorWelcomeEvent>[0]> = {}) {
  return createDoorWelcomeEvent({
    showSlug: "august-show",
    displayName: "Pamela Blevins",
    quantityCheckedIn: 1,
    ticketQuantity: 2,
    checkedInTotal: 1,
    assignedSeatLabels: ["R-A1", "R-A2"],
    admissionCategory: "Paid Online",
    ...overrides,
  });
}

test("welcome display opens in a stable named window and focuses the reused window", () => {
  let openedUrl = "";
  let openedName = "";
  let focusCount = 0;
  const fakeOpen = ((url?: string | URL, target?: string) => {
    openedUrl = String(url);
    openedName = target ?? "";
    return { focus: () => { focusCount += 1; } } as Window;
  }) as typeof window.open;

  openDoorWelcomeDisplay("august-show", fakeOpen);
  openDoorWelcomeDisplay("august-show", fakeOpen);
  assert.equal(openedUrl, "/admin/august-show/door/welcome-display");
  assert.equal(openedName, DOOR_WELCOME_WINDOW_NAME);
  assert.equal(focusCount, 2);
});

test("safe payload is narrow and excludes private admission fields", () => {
  const event = namedEvent();
  assert.deepEqual(Object.keys(event).sort(), [
    "admissionCategory", "assignedSeatLabels", "checkedInTotal", "displayName",
    "messageType", "quantityCheckedIn", "showSlug", "ticketQuantity", "timestamp", "version",
  ]);
  const serialized = JSON.stringify(event);
  for (const privateField of ["email", "token", "square", "order_id", "notes", "payment", "resend"]) {
    assert.doesNotMatch(serialized.toLowerCase(), new RegExp(privateField));
  }
});

test("BroadcastChannel publishes once, closes safely, and failure is isolated", () => {
  const posted: unknown[] = [];
  let closed = false;
  class FakeChannel {
    constructor(name: string) { assert.equal(name, doorWelcomeChannelName("august-show")); }
    postMessage(value: unknown) { posted.push(value); }
    close() { closed = true; }
  }
  assert.equal(publishDoorWelcomeEvent("august-show", namedEvent(), FakeChannel as unknown as typeof BroadcastChannel), true);
  assert.equal(posted.length, 1);
  assert.equal(closed, true);
  class BrokenChannel { constructor() { throw new Error("unsupported"); } }
  assert.equal(publishDoorWelcomeEvent("august-show", namedEvent(), BrokenChannel as unknown as typeof BroadcastChannel), false);
  assert.equal(publishDoorWelcomeEvent("august-show", namedEvent(), null), false);
});

test("partial, singular, plural, and paid-door wording is accurate", () => {
  assert.equal(doorWelcomeProgressText(namedEvent()), "1 of 2 Guests Checked In");
  assert.equal(doorWelcomeProgressText(namedEvent({ ticketQuantity: 1, checkedInTotal: 1 })), "1 Guest Checked In");
  assert.equal(doorWelcomeProgressText(namedEvent({ quantityCheckedIn: 2, ticketQuantity: 2, checkedInTotal: 2 })), "2 Guests Checked In");
  assert.equal(doorWelcomeProgressText(namedEvent({
    displayName: null, quantityCheckedIn: 5, ticketQuantity: 5, checkedInTotal: 5, admissionCategory: "Paid Door",
  })), "5 Guests Admitted");
});

test("Door Mode broadcasts only after successful positive actions, never undo or failure", async () => {
  const source = await readFile(doorModePath, "utf8");
  assert.match(source, /if \(error\) \{\s*throw error;\s*\}[\s\S]*publishWelcome\(/);
  assert.match(source, /if \(delta > 0\)[\s\S]*publishWelcome\(/);
  assert.match(source, /if \(checkedInByAction > 0\)[\s\S]*publishWelcome\(/);
  assert.match(source, /assignedSeatLabels: seatIdsByTicketId\[item\.id\] \?\? \[\]/);
  const undoBlock = source.slice(source.indexOf("async function handleUndoLastAction"), source.indexOf("if (isLoading)"));
  assert.doesNotMatch(undoBlock, /publishWelcome/);
  assert.match(source, /displayName: null[\s\S]*admissionCategory: "Paid Door"/);
});

test("display transitions between idle and welcome while preserving the ten-second timeout", async () => {
  const source = await readFile(displayPath, "utf8");
  assert.equal(DOOR_WELCOME_IDLE_TIMEOUT_MS, 10_000);
  assert.match(source, /const DISPLAY_TRANSITION_MS = 250/);
  assert.match(source, /transition-opacity duration-\[250ms\]/);
  assert.match(source, /setIsWelcomeExiting\(true\)/);
  assert.match(source, /DOOR_WELCOME_IDLE_TIMEOUT_MS \+ DISPLAY_TRANSITION_MS/);
  assert.match(source, /\}, \[welcome\]\)/);
});

test("new welcome events replace the active message and reset transition and idle rotation state", async () => {
  const source = await readFile(displayPath, "utf8");
  assert.match(source, /setIdleMessageIndex\(0\);\s*setIsWelcomeExiting\(false\);\s*setWelcome\(message\.data\)/);
  assert.match(source, /key=\{welcome\.timestamp\}/);
  assert.match(source, /window\.clearTimeout\(idleTimeout\)/);
  assert.match(source, /window\.clearTimeout\(clearTimeout\)/);
});

test("active hierarchy is responsive, long-name safe, and omits an anonymous name block", async () => {
  const source = await readFile(displayPath, "utf8");
  assert.match(source, /welcome\.displayName \? \(/);
  assert.match(source, /text-\[clamp\(2\.5rem,7\.5vw,7\.5rem\)\]/);
  assert.match(source, /if \(name\.length > 36\)/);
  assert.match(source, /if \(name\.length > 24\)/);
  assert.match(source, /guestNameSizeClass\(welcome\.displayName\)/);
  assert.match(source, /\[overflow-wrap:anywhere\]/);
  assert.match(source, /max-w-\[94vw\]/);
  assert.match(source, /doorWelcomeGuestCount\(welcome\.quantityCheckedIn\)/);
  assert.match(source, /Enjoy the Show!/);
  assert.doesNotMatch(source, /Welcome to the Show!<\/p>/);
});

test("reserved seats are conditional, wrap safely, and receive one subtle entrance treatment", async () => {
  const source = await readFile(displayPath, "utf8");
  assert.match(source, /welcome\.assignedSeatLabels\.length > 0/);
  assert.doesNotMatch(source, /No seats assigned/);
  assert.match(source, /motion-safe:animate-\[seats-in_300ms_ease-out_120ms_both\]/);
  assert.match(source, /chunkDoorWelcomeSeats\(welcome\.assignedSeatLabels\)/);
  assert.match(source, /max-w-\[92vw\]/);
});

test("idle rotation runs only while idle and exposes no totals or internal status", async () => {
  const source = await readFile(displayPath, "utf8");
  assert.match(source, /const IDLE_ROTATION_INTERVAL_MS = 15_000/);
  assert.match(source, /if \(welcome\) return;\s*const rotation = window\.setInterval/);
  assert.match(source, /const activeIdleIndex = idleMessageIndex % idleMessages\.length/);
  assert.match(source, /Thank You to Our Sponsors/);
  assert.match(source, /buildTimedIdleMessages/);
  assert.doesNotMatch(source, /attendance|check-in statistics|Square status|running total/i);
});

test("fullscreen, reduced motion, and BroadcastChannel behavior remain intact", async () => {
  const source = await readFile(displayPath, "utf8");
  assert.match(source, /document\.documentElement\.requestFullscreen\(\)/);
  assert.match(source, /!isFullscreen/);
  assert.match(source, /new BroadcastChannel\(doorWelcomeChannelName\(showSlug\)\)/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /animation-delay: 0ms !important/);
  assert.match(source, /transition-duration: 0\.01ms !important/);
});
test("Phase 1.3 replaces the idle CMMS logo only when a sponsor logo is available on the sponsor slide", async () => {
  const source = await readFile(displayPath, "utf8");
  assert.match(source, /const isSponsorSlide = activeIdleMessage === "Thank You to Our Sponsors"/);
  assert.match(source, /const activeSponsorLogo = isSponsorSlide && sponsorLogos\.length > 0/);
  assert.match(source, /\{activeSponsorLogo \? \(/);
  assert.match(source, /src=\{activeSponsorLogo\.logoUrl\}/);
  assert.match(source, /alt=\{`\$\{activeSponsorLogo\.name\} logo`\}/);
  assert.match(source, /\) : \(\s*<Image\s*key="cmms-logo"/);
  assert.match(source, /src="\/cmms-logo\.png"/);
});

test("Phase 1.3 gives sponsor logos a large fixed responsive showcase without distortion or clipping", async () => {
  const source = await readFile(displayPath, "utf8");
  assert.match(source, /HERO_LOGO_CONTAINER_CLASS = "mx-auto flex h-\[min\(38vh,26rem\)\] w-\[min\(68vw,52rem\)\] items-center justify-center/);
  assert.match(source, /HERO_LOGO_IMAGE_CLASS = "h-full w-full object-contain/);
  assert.equal((source.match(/className=\{HERO_LOGO_IMAGE_CLASS\}/g) ?? []).length, 2);
  assert.match(source, /motion-safe:animate-\[logo-swap-in_400ms_ease-out\]/);
  assert.match(source, /@keyframes logo-swap-in/);
  assert.match(source, /p-\[clamp\(0\.125rem,0\.5vw,0\.5rem\)\]/);
  assert.match(source, /overflow-hidden/);
});

test("Phase 1.3 rotates distinct valid sponsor logos once per existing idle cycle", async () => {
  const source = await readFile(displayPath, "utf8");
  assert.match(source, /return name && logoUrl \? \[\{ name, logoUrl \}\] : \[\]/);
  assert.match(source, /findIndex\(\(item\) => item\.logoUrl === logo\.logoUrl\) === index/);
  assert.match(source, /const sponsorCycle = Math\.floor\(idleMessageIndex \/ idleMessages\.length\)/);
  assert.match(source, /sponsorLogos\[sponsorCycle % sponsorLogos\.length\]/);
  assert.match(source, /setIdleMessageIndex\(\(current\) => current \+ 1\)/);
  assert.equal((source.match(/window\.setInterval/g) ?? []).length, 2);
  assert.match(source, /const IDLE_ROTATION_INTERVAL_MS = 15_000/);
});

test("Phase 1.3 reuses the existing show read and established sponsor logo relation", async () => {
  const source = await readFile(displayPath, "utf8");
  assert.equal((source.match(/\.from\("shows"\)/g) ?? []).length, 2);
  assert.doesNotMatch(source, /\.from\("show_sponsors"\)/);
  assert.match(source, /show_sponsors\(placement_order, sponsor:sponsor_library\(name, logo_url\)\)/);
  assert.match(source, /\.sort\(\(left, right\) => left\.placement_order - right\.placement_order\)/);
});

test("Phase 1.3 keeps the sponsor headline and all fixed supporting content centered", async () => {
  const source = await readFile(displayPath, "utf8");
  assert.match(source, /"Thank You to Our Sponsors"/);
  assert.match(source, /<span>Big-Time Show<\/span>\s*<span>Small-Town Hospitality<\/span>/);
  assert.match(source, /showDate \? <p>\{showDate\}<\/p> : null/);
  assert.match(source, /showVenue \? <p>\{showVenue\}<\/p> : null/);
  assert.match(source, /www\.cumberlandmountainmusic\.com/);
  assert.equal((source.match(/www\.cumberlandmountainmusic\.com/g) ?? []).length, 1);
  assert.equal((source.match(/<span>Big-Time Show<\/span>/g) ?? []).length, 1);
  assert.match(source, /className=\{HERO_LOGO_CONTAINER_CLASS\}/);
});

test("Phase 1.3 preserves the active logo hierarchy, responsive centering, and accessibility", async () => {
  const source = await readFile(displayPath, "utf8");
  assert.match(source, /max-h-\[24vh\] w-\[clamp\(13rem,36vw,32rem\)\]/);
  assert.match(source, /text-\[clamp\(2\.5rem,7\.5vw,7\.5rem\)\]/);
  assert.match(source, /h-screen min-h-\[24rem\].*overflow-hidden/);
  assert.match(source, /aria-live="off"/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /transition-duration: 0\.01ms !important/);
});

test("Phase 1.3 remains presentation-only and leaves messaging, timers, and mutations untouched", async () => {
  const displaySource = await readFile(displayPath, "utf8");
  const doorSource = await readFile(doorModePath, "utf8");
  assert.doesNotMatch(displaySource, /\.insert\(|\.update\(|\.delete\(/);
  assert.match(displaySource, /DOOR_WELCOME_IDLE_TIMEOUT_MS/);
  assert.match(displaySource, /IDLE_ROTATION_INTERVAL_MS/);
  assert.match(doorSource, /publishDoorWelcomeEvent/);
  assert.doesNotMatch(displaySource, /publishDoorWelcomeEvent/);
});
test("Phase 2 adds premium guest hierarchy and calm motion without changing welcome timing", async () => {
  const source = await readFile(displayPath, "utf8");
  assert.match(source, />\s*Now Welcoming\s*</);
  assert.match(source, /guest-welcome-in_300ms_ease-out/);
  assert.match(source, /guest-spotlight_9500ms_ease-out_forwards/);
  assert.match(source, /venue-gradient_50s_ease-in-out_infinite/);
  assert.match(source, /doorWelcomeGuestCount\(welcome\.quantityCheckedIn\)/);
  assert.match(source, /chunkDoorWelcomeSeats\(welcome\.assignedSeatLabels\)/);
  assert.match(source, /line\.join\(" • "\)/);
  assert.match(source, /DOOR_WELCOME_IDLE_TIMEOUT_MS \+ DISPLAY_TRANSITION_MS/);
});

test("Phase 2.1 uses additive New York timed windows without touching Door Mode", async () => {
  const displaySource = await readFile(displayPath, "utf8");
  const doorSource = await readFile(doorModePath, "utf8");
  assert.match(displaySource, /resolveTimedIdleWindow\(clockNow\)/);
  assert.match(displaySource, /buildTimedIdleMessages\(timedIdleWindow\)/);
  assert.match(displaySource, /const clock = window\.setInterval/);
  assert.match(displaySource, /}, 60_000\)/);
  assert.match(displaySource, /activeIdleMessage === POST_SHOW_HEADLINE && nextShowDate/);
  assert.doesNotMatch(displaySource, /resolveDoorWelcomeMode|doorWelcomeModeHeadlines|presentationOverride/);
  assert.doesNotMatch(doorSource, /welcome-display-presentation-mode|DOOR_WELCOME_OVERRIDE_MODES/);
  assert.doesNotMatch(displaySource, /postMessage\(/);
});
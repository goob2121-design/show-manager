import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_IDLE_MESSAGES,
  DOORS_OPEN_SOON_HEADLINE,
  POST_SHOW_HEADLINE,
  SPONSOR_IDLE_MESSAGES,
  WELCOME_DISPLAY_TIME_ZONE,
  buildGuestIdleSlides,
  buildTimedIdleSlides,
  chunkDoorWelcomeSeats,
  doorWelcomeGuestCount,
  isSponsorIdleSlide,
  resolveTimedIdleWindow,
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "./door-welcome-presentation.ts";

function newYorkTime(iso: string) {
  return new Date(iso);
}

test("timed idle windows use the fixed New York time zone", () => {
  assert.equal(WELCOME_DISPLAY_TIME_ZONE, "America/New_York");
  assert.equal(resolveTimedIdleWindow(newYorkTime("2026-08-15T20:59:00Z")), "normal");
  assert.equal(resolveTimedIdleWindow(newYorkTime("2026-08-15T21:00:00Z")), "doors-open-soon");
  assert.equal(resolveTimedIdleWindow(newYorkTime("2026-08-15T21:59:59Z")), "doors-open-soon");
  assert.equal(resolveTimedIdleWindow(newYorkTime("2026-08-15T22:00:00Z")), "normal");
  assert.equal(resolveTimedIdleWindow(newYorkTime("2026-08-16T00:59:59Z")), "normal");
  assert.equal(resolveTimedIdleWindow(newYorkTime("2026-08-16T01:00:00Z")), "post-show");
  assert.equal(resolveTimedIdleWindow(newYorkTime("2026-08-16T02:59:59Z")), "post-show");
  assert.equal(resolveTimedIdleWindow(newYorkTime("2026-08-16T03:00:00Z")), "normal");
});

test("timed slides are additive and preserve every existing message in order", () => {
  const normal = buildTimedIdleSlides("normal");
  const doors = buildTimedIdleSlides("doors-open-soon");
  const postShow = buildTimedIdleSlides("post-show");
  const headlines = (slides: typeof normal) => slides.flatMap((slide) => slide.kind === "guest" ? [] : [slide.headline]);
  assert.deepEqual(headlines(normal), [...BASE_IDLE_MESSAGES]);
  assert.deepEqual(headlines(doors).slice(0, BASE_IDLE_MESSAGES.length), [...BASE_IDLE_MESSAGES]);
  assert.deepEqual(headlines(postShow).slice(0, BASE_IDLE_MESSAGES.length), [...BASE_IDLE_MESSAGES]);
  assert.equal(headlines(doors).at(-1), DOORS_OPEN_SOON_HEADLINE);
  assert.equal(headlines(postShow).at(-1), POST_SHOW_HEADLINE);
  assert.deepEqual(BASE_IDLE_MESSAGES, [
    "Welcome to the Cumberland Mountain Music Show",
    "Thank You to Our Sponsors",
    "Enjoy Tonight's Show",
    "Thank You for Supporting Live Music",
    "Be Sure to Visit Our Concession Stand",
    "Thanks for Spending Your Evening With Us",
    "Proudly Supported By",
    "Thank You for Being Part of the CMMS Family",
  ]);
  assert.deepEqual(SPONSOR_IDLE_MESSAGES, [
    "Thank You to Our Sponsors",
    "Proudly Supported By",
  ]);
});

test("eligible guests reuse their photo URL and remain eligible without a photo", () => {
  const slides = buildGuestIdleSlides([
    { name: "The Lonesome Steel Rails", photo_url: " https://example.com/guest.jpg ", is_confirmed: true, permission_granted: true },
    { name: "Text Only Guest", photo_url: null, is_confirmed: true, permission_granted: true },
  ]);
  assert.deepEqual(slides, [
    { kind: "guest", name: "The Lonesome Steel Rails", photoUrl: "https://example.com/guest.jpg" },
    { kind: "guest", name: "Text Only Guest", photoUrl: null },
  ]);
});

test("unconfirmed, unpermitted, and unnamed guests are excluded", () => {
  const slides = buildGuestIdleSlides([
    { name: "Unconfirmed", photo_url: null, is_confirmed: false, permission_granted: true },
    { name: "No Permission", photo_url: null, is_confirmed: true, permission_granted: false },
    { name: "  ", photo_url: null, is_confirmed: true, permission_granted: true },
  ]);
  assert.deepEqual(slides, []);
});

test("guest slides are early while existing messages retain their relative order", () => {
  const guestSlides = buildGuestIdleSlides([
    { name: "Guest One", photo_url: null, is_confirmed: true, permission_granted: true },
    { name: "Guest Two", photo_url: null, is_confirmed: true, permission_granted: true },
  ]);
  const slides = buildTimedIdleSlides("normal", guestSlides);
  assert.equal(slides[0]?.kind, "message");
  assert.equal(slides[1]?.kind, "guest");
  assert.equal(slides[3]?.kind, "guest");
  assert.deepEqual(
    slides.flatMap((slide) => slide.kind === "guest" ? [] : [slide.headline]),
    [...BASE_IDLE_MESSAGES],
  );
});

test("both sponsor headlines keep the typed deterministic sponsor-slide behavior", () => {
  const sponsorSlides = buildTimedIdleSlides("normal").filter((slide) => slide.kind === "sponsor");
  assert.deepEqual(sponsorSlides.map((slide) => slide.headline), [...SPONSOR_IDLE_MESSAGES]);
  assert.ok(sponsorSlides.every(isSponsorIdleSlide));
});

test("seat labels remain canonical, ordered, and wrap after six", () => {
  const seats = ["L-B4", "L-B5", "L-B6", "L-B7", "L-B8", "L-B9", "L-B10"];
  assert.deepEqual(chunkDoorWelcomeSeats(seats), [
    ["L-B4", "L-B5", "L-B6", "L-B7", "L-B8", "L-B9"],
    ["L-B10"],
  ]);
});

test("guest count uses correct singular and plural wording", () => {
  assert.equal(doorWelcomeGuestCount(1), "1 Guest");
  assert.equal(doorWelcomeGuestCount(4), "4 Guests");
});
import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_IDLE_MESSAGES,
  DOORS_OPEN_SOON_HEADLINE,
  POST_SHOW_HEADLINE,
  SPONSOR_IDLE_MESSAGES,
  WELCOME_DISPLAY_TIME_ZONE,
  buildTimedIdleMessages,
  chunkDoorWelcomeSeats,
  doorWelcomeGuestCount,
  isSponsorIdleMessage,
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

test("timed slides are additive and preserve the complete normal rotation", () => {
  const doors = buildTimedIdleMessages("doors-open-soon");
  const postShow = buildTimedIdleMessages("post-show");
  assert.deepEqual(doors.slice(0, BASE_IDLE_MESSAGES.length), [...BASE_IDLE_MESSAGES]);
  assert.deepEqual(postShow.slice(0, BASE_IDLE_MESSAGES.length), [...BASE_IDLE_MESSAGES]);
  assert.ok(doors.includes(DOORS_OPEN_SOON_HEADLINE));
  assert.ok(postShow.includes(POST_SHOW_HEADLINE));
  assert.ok(doors.includes("Thank You to Our Sponsors"));
  assert.ok(postShow.includes("Thank You to Our Sponsors"));
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
  assert.equal(buildTimedIdleMessages("normal").length, 8);
  assert.equal(doors.length, 9);
  assert.equal(postShow.length, 9);
  assert.equal(doors.at(-1), DOORS_OPEN_SOON_HEADLINE);
  assert.equal(postShow.at(-1), POST_SHOW_HEADLINE);
});

test("both sponsor headlines use the shared deterministic sponsor-slide behavior", () => {
  assert.equal(isSponsorIdleMessage("Thank You to Our Sponsors"), true);
  assert.equal(isSponsorIdleMessage("Proudly Supported By"), true);
  assert.equal(isSponsorIdleMessage("Enjoy Tonight's Show"), false);
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
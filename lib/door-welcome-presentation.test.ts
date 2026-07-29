import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_IDLE_MESSAGES,
  DOORS_OPEN_SOON_HEADLINE,
  POST_SHOW_HEADLINE,
  WELCOME_DISPLAY_TIME_ZONE,
  buildTimedIdleMessages,
  chunkDoorWelcomeSeats,
  doorWelcomeGuestCount,
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
  assert.equal(buildTimedIdleMessages("normal").length, 4);
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
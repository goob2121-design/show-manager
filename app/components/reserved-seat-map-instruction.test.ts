import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seatMapSource = readFileSync("app/components/reserved-seat-map.tsx", "utf8");
const customerPageSource = readFileSync("app/components/reserved-seat-selection-page.tsx", "utf8");
const adminSource = readFileSync("app/components/reserved-seating-panel.tsx", "utf8");
const sponsorSource = readFileSync("app/components/sponsor-packet-builder.tsx", "utf8");
const doorSource = readFileSync("app/components/door-mode-page.tsx", "utf8");

test("customer seat map opts into the mobile center-aisle start exclusively", () => {
  assert.match(customerPageSource, /initialMobileView="center-aisle"/);
  assert.doesNotMatch(adminSource, /initialMobileView/);
  assert.doesNotMatch(sponsorSource, /initialMobileView/);
  assert.doesNotMatch(doorSource, /initialMobileView/);
});

test("initial mobile positioning retries invalid Safari layout measurements", () => {
  assert.match(seatMapSource, /window\.matchMedia\("\(max-width: 1023px\)"\)\.matches/);
  assert.match(seatMapSource, /hasAppliedInitialMobileView\.current/);
  assert.match(seatMapSource, /const maxAttempts = 4/);
  assert.match(seatMapSource, /requestAnimationFrame[\s\S]*requestAnimationFrame/);
  assert.match(seatMapSource, /scheduleAttempt\(50\)/);
  assert.match(seatMapSource, /isValidInitialSeatMapMeasurement/);
  assert.match(seatMapSource, /contentWidth: scroller\.scrollWidth/);
  assert.match(seatMapSource, /scroller\.scrollLeft = target/);
  assert.match(seatMapSource, /getBoundingClientRect\(\)/);
  assert.match(seatMapSource, /data-seat-map-center-aisle/);
  assert.match(seatMapSource, /data-seat-map-content/);
  assert.match(seatMapSource, /data-seat-map-selected/);
  assert.match(seatMapSource, /selectedSeatCenters/);
});

test("initial positioning stops after success or user interaction and never follows seat rerenders", () => {
  assert.match(seatMapSource, /hasAppliedInitialMobileView\.current = true/);
  assert.match(seatMapSource, /hasCancelledInitialMobileView\.current = true/);
  assert.match(seatMapSource, /\["touchstart", "pointerdown", "wheel", "scroll"\]/);
  assert.match(seatMapSource, /cancelScheduledWork\(\)/);
  assert.match(seatMapSource, /\}, \[initialMobileView\]\);/);
  assert.doesNotMatch(seatMapSource, /onScroll=/);
});

test("mobile instruction is compact while scrolling, dimensions, and selection hooks remain intact", () => {
  assert.match(seatMapSource, /Swipe left or right to view all seats\./);
  assert.match(seatMapSource, /lg:hidden/);
  assert.match(seatMapSource, /overflow-x-auto overscroll-x-contain touch-pan-x/);
  assert.match(seatMapSource, /min-w-\[900px\]/);
  assert.match(seatMapSource, /onClick=\{\(\) => onSeatClick\?\.\(seatId\)\}/);
});

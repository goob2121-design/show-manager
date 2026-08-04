import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seatMapSource = readFileSync("app/components/reserved-seat-map.tsx", "utf8");
const customerPageSource = readFileSync("app/components/reserved-seat-selection-page.tsx", "utf8");

test("mobile instruction explains both sections, the aisle, and manual swiping", () => {
  assert.match(seatMapSource, />TWO<\/strong> seating sections:/);
  assert.match(seatMapSource, />LEFT<\/strong>/);
  assert.match(seatMapSource, />RIGHT<\/strong>/);
  assert.match(seatMapSource, /separated by a center aisle\./);
  assert.match(seatMapSource, />BELOW<\/strong> left or right to view /);
  assert.match(seatMapSource, />BOTH<\/strong> sides/);
  assert.match(seatMapSource, /lg:hidden/);
});

test("automatic mobile centering and its retry machinery are removed", () => {
  assert.doesNotMatch(seatMapSource, /initialMobileView/);
  assert.doesNotMatch(customerPageSource, /initialMobileView/);
  assert.doesNotMatch(seatMapSource, /scrollLeft\s*=/);
  assert.doesNotMatch(seatMapSource, /requestAnimationFrame|setTimeout|ResizeObserver/);
  assert.doesNotMatch(seatMapSource, /data-seat-map-(?:content|center-aisle|selected)/);
  assert.doesNotMatch(seatMapSource, /useLayoutEffect|useRef/);
});

test("manual scrolling, dimensions, and seat selection hooks remain intact", () => {
  assert.match(seatMapSource, /overflow-x-auto overscroll-x-contain touch-pan-x/);
  assert.match(seatMapSource, /min-w-\[900px\]/);
  assert.match(seatMapSource, /onClick=\{\(\) => onSeatClick\?\.\(seatId\)\}/);
});

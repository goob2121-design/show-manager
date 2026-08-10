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

test("public mobile chooser switches visual sections without changing shared seat state", () => {
  assert.match(customerPageSource, /enableMobileSectionSelector/);
  assert.match(seatMapSource, /useState<"left" \| "right" \| null>\(null\)/);
  assert.match(seatMapSource, /Choose a seating section/);
  assert.match(seatMapSource, /The room has a Left Section and Right Section separated by a center aisle\./);
  assert.match(seatMapSource, />\s*Left Section\s*<\/button>/);
  assert.match(seatMapSource, />\s*Right Section\s*<\/button>/);
  assert.match(seatMapSource, /aria-pressed=\{mobileSection === "left"\}/);
  assert.match(seatMapSource, /aria-pressed=\{mobileSection === "right"\}/);
  assert.match(seatMapSource, /enableMobileSectionSelector && !mobileSection/);
  assert.match(seatMapSource, /Select Left Section or Right Section above to view seats\./);
  assert.equal(seatMapSource.match(/enableMobileSectionSelector && mobileSection \? \(/g)?.length, 2);
  assert.match(seatMapSource, /overflow-x-hidden lg:overflow-x-auto/);
  assert.equal(seatMapSource.match(/enableMobileSectionSelector \? "min-w-0 sm:min-w-0"/g)?.length, 2);
  assert.match(seatMapSource, /const sectionConfig = mobileSection === "left" \? leftSectionConfig : rightSectionConfig/);
  assert.match(seatMapSource, /\{mobileRowLabel\}\s*\{mobileSeatGrid\}/);
  assert.match(seatMapSource, /mobileSection === "left" \? "CENTER AISLE →" : "← CENTER AISLE"/);
  assert.doesNotMatch(seatMapSource, /scaleX|scale-x/);
  assert.match(seatMapSource, /max-w-\[28rem\]/);
  assert.match(seatMapSource, /aspect-square min-h-0 w-full/);
  assert.match(seatMapSource, /hidden lg:grid/);
  assert.doesNotMatch(seatMapSource, /setSelectedSeatIds/);
});

test("mobile stage stays centered and the fixed action bar has clearance", () => {
  assert.match(seatMapSource, /mx-auto mb-2\.5 flex w-full max-w-\[28rem\]/);
  assert.match(seatMapSource, /text-base font-black uppercase tracking-\[0\.2em\]/);
  assert.match(seatMapSource, /hidden lg:flex/);
  assert.match(customerPageSource, /py-6 pb-40 text-slate-100 sm:px-6 sm:py-8 sm:pb-8/);
});

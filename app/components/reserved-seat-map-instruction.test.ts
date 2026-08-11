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
  assert.match(seatMapSource, />Step 1<\/p>/);
  assert.match(seatMapSource, />Choose a Section<\/p>/);
  assert.match(seatMapSource, /The room has two seating sections separated by a center aisle\. Choose Left or Right to view available seats\./);
  assert.match(seatMapSource, />\s*Left Section\s*<\/button>/);
  assert.match(seatMapSource, />\s*Right Section\s*<\/button>/);
  assert.match(seatMapSource, /aria-pressed=\{mobileSection === "left"\}/);
  assert.match(seatMapSource, /aria-pressed=\{mobileSection === "right"\}/);
  assert.match(seatMapSource, /enableMobileSectionSelector && !mobileSection/);
  assert.match(seatMapSource, /Choose a section above to see the seating chart\./);
  assert.match(seatMapSource, />Step 2<\/p>/);
  assert.match(seatMapSource, />Choose Your Seats<\/p>/);
  assert.match(seatMapSource, /Tap any green seat to select it\./);
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

test("mobile page prioritizes seat selection and collapses optional help", () => {
  assert.match(customerPageSource, /<aside className="order-2[^\"]*sm:order-1[^\"]*xl:order-2/);
  assert.match(customerPageSource, /<div className="order-1[^\"]*sm:order-2 xl:order-1">/);
  assert.match(customerPageSource, /useState\(false\).*isMobileHelpExpanded|isMobileHelpExpanded, setIsMobileHelpExpanded/);
  assert.match(customerPageSource, /Don&apos;t want to choose\? We&apos;ll choose for you/);
  assert.match(customerPageSource, /aria-expanded=\{isMobileHelpExpanded\}/);
  assert.match(customerPageSource, /isMobileHelpExpanded \? "block" : "hidden"/);
  assert.match(customerPageSource, /saveSeatPreference\("auto_assign"\)/);
});

test("mobile action bar reflects section and seat progress without changing enablement", () => {
  assert.match(customerPageSource, /onMobileSectionChange=\{\(\) => setHasSelectedMobileSection\(true\)\}/);
  assert.match(customerPageSource, /Choose a Section Above/);
  assert.match(customerPageSource, /Select Your Seat/);
  assert.match(customerPageSource, /Continue \\u2014 \$\{selectedSeatIds\.length\} Seat/);
  assert.match(customerPageSource, /selectedSeatIds\.length === 1 \? "" : "s"/);
  assert.match(customerPageSource, /disabled=\{isSubmitting \|\| selectedSeatIds\.length === 0\}/);
});

test("section buttons retain their local state behavior and only notify the page", () => {
  assert.match(seatMapSource, /setMobileSection\("left"\);\s*onMobileSectionChange\?\.\("left"\);/);
  assert.match(seatMapSource, /setMobileSection\("right"\);\s*onMobileSectionChange\?\.\("right"\);/);
  assert.doesNotMatch(seatMapSource, /setSelectedSeatIds/);
});

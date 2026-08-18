import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const showPageSource = readFileSync("app/components/show-page.tsx", "utf8").replace(/\r\n/g, "\n");
const performanceSetupSource = readFileSync("app/components/performance-setup-page.tsx", "utf8").replace(/\r\n/g, "\n");
const performanceSetupRouteSource = readFileSync("app/admin/[slug]/performance-setup/page.tsx", "utf8").replace(/\r\n/g, "\n");

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("Music & Setlist exposes Setlist, Song Library, and Performance Setup", () => {
  const navigation = sourceBetween(
    showPageSource,
    'aria-label="Music and setlist sections"',
    "{isAdminView && activeAdminTab === \"overview\"",
  );

  assert.match(navigation, /label: "Setlist"/);
  assert.match(navigation, /label: "Song Library"/);
  assert.match(navigation, /href=\{`\/admin\/\$\{encodeURIComponent\(showSlug\)\}\/performance-setup`\}/);
  assert.match(navigation, />\s*Performance Setup\s*<\/Link>/);
});

test("Setlist and Song Library remain local Music & Setlist views", () => {
  assert.match(showPageSource, /activeMusicAdminSubTab === "setlist"/);
  assert.match(showPageSource, /activeMusicAdminSubTab === "songs"/);
  assert.match(showPageSource, /onClick=\{\(\) => setActiveMusicAdminSubTab\(tab\.key\)\}/);
});

test("Performance Setup keeps its existing standalone route", () => {
  assert.match(performanceSetupRouteSource, /<AdminGate slug=\{slug\}>/);
  assert.match(performanceSetupRouteSource, /<PerformanceSetupPage showSlug=\{slug\} \/>/);
});

test("Performance Setup returns to Music & Setlist", () => {
  assert.match(performanceSetupSource, /\?tab=music-setlist/);
  assert.match(performanceSetupSource, />Music &amp; Setlist<\/Link>/);
  assert.doesNotMatch(performanceSetupSource, /\?tab=rehearsal/);
});

test("Rehearsal remains independently available without owning preparation or Live Mode navigation", () => {
  assert.match(showPageSource, /\{ key: "rehearsal", label: "Rehearsal" \}/);
  const rehearsalSection = sourceBetween(
    showPageSource,
    "{shouldShowBandRehearsalTab ? (",
    "{shouldShowGuestPromoMaterialsTab || shouldShowBandPromoMaterialsTab ? (",
  );
  assert.doesNotMatch(rehearsalSection, /\/performance-setup/);
  assert.doesNotMatch(rehearsalSection, /\/live/);
  assert.match(showPageSource.slice(showPageSource.indexOf(rehearsalSection) + rehearsalSection.length), /href=\{`\/band\/\$\{encodeURIComponent\(show\.slug\)\}\/live`\}/);
});

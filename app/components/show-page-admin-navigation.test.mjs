import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const showPageUrl = new URL("show-page.tsx", import.meta.url);
const squareIntegrationPageUrl = new URL("../admin/[slug]/square-integration/page.tsx", import.meta.url);

test("Admin Sections has the requested ten-button layout", async () => {
  const source = await readFile(showPageUrl, "utf8");
  const itemsStart = source.indexOf("const adminTabItems");
  const itemsEnd = source.indexOf("];", itemsStart);
  const items = source.slice(itemsStart, itemsEnd);
  const labels = [...items.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(labels, [
    "Overview",
    "Music & Setlist",
    "Guests",
    "Tickets / Check-In",
    "Square Integration",
    "Finance",
    "Promo Materials",
    "Sponsors",
    "MC Builder",
    "Show Details",
  ]);
  assert.equal(labels.length, 10);
  assert.doesNotMatch(items, /label: "Setlist"|label: "Songs"/);
  assert.match(source, /lg:grid-cols-5/);
});

test("Music & Setlist keeps the existing Setlist and Song Library areas available", async () => {
  const source = await readFile(showPageUrl, "utf8");

  assert.match(source, /aria-label="Music and setlist sections"/);
  assert.match(source, /\{ key: "setlist", label: "Setlist" \}/);
  assert.match(source, /\{ key: "songs", label: "Song Library" \}/);
  assert.match(source, /activeAdminTab === "music-setlist" && activeMusicAdminSubTab === "setlist"/);
  assert.match(source, /activeAdminTab === "music-setlist" && activeMusicAdminSubTab === "songs"/);
  assert.match(source, /<h2[^>]*>Song Library<\/h2>/);
  assert.match(source, /<h2[^>]*>[\s\S]*Setlist for/);
});

test("Square Integration is linked from Admin Sections and not rendered as an Overview panel", async () => {
  const [source, squarePage] = await Promise.all([
    readFile(showPageUrl, "utf8"),
    readFile(squareIntegrationPageUrl, "utf8"),
  ]);
  const overviewStart = source.indexOf('{isAdminView && activeAdminTab === "overview"');
  const overviewEnd = source.indexOf('{isAdminView && activeAdminTab === "mc-builder"', overviewStart);
  const overview = source.slice(overviewStart, overviewEnd);

  assert.match(source, /href=\{`\/admin\/\$\{encodeURIComponent\(showSlug\)\}\/square-integration`\}/);
  assert.doesNotMatch(overview, /Square Ticketing|Square Integration Status|Square Catalog/);
  assert.match(squarePage, /Square Integration/);
  assert.match(squarePage, /<SquareFinanceSyncControl/);
});

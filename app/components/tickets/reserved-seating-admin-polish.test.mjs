import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolsUrl = new URL("reserved-seating-panel.tsx", import.meta.url);
const cardsUrl = new URL("../reserved-seating-panel.tsx", import.meta.url);

test("Public Availability actions live in the Reserved Seating tools grid without a standalone panel", async () => {
  const source = await readFile(toolsUrl, "utf8");
  assert.match(source, /onClick=\{onOpenPublicSeatAvailabilityPage\}[\s\S]*Open Public Availability/);
  assert.match(source, /onClick=\{onCopyPublicSeatAvailabilityLink\}[\s\S]*Copy Availability Link/);
  assert.doesNotMatch(source, /<h3[^>]*>Public Seat Availability<\/h3>/);
  assert.match(source, /Public availability URL: \{publicSeatAvailabilityUrl\}/);
  assert.match(source, /Generic fallback: \{genericPublicSeatAvailabilityUrl\}/);
  assert.match(source, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.doesNotMatch(source, /Online orders are automatically added to Reserved Seating/);
});

test("adjacent reservation cards use subtle alternating dark surfaces and stronger spacing", async () => {
  const source = await readFile(cardsUrl, "utf8");
  assert.match(source, /filteredLinksWithSeats\.map\(\(link, index\) =>/);
  assert.match(source, /index % 2 === 0/);
  assert.match(source, /border-white\/20 border-l-slate-500\/60 bg-\[#07111f\]/);
  assert.match(source, /border-white\/25 border-l-slate-400\/70 bg-\[#142238\]/);
  assert.match(source, /className="mt-4 grid gap-5"/);
  assert.match(source, /rounded-2xl border border-l-2 p-4/);
});

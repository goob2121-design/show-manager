import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(root, "app", "components", "reserved-seat-selection-page.tsx"),
  "utf8",
);

test("free-child seating starts expanded only when child seats already exist", () => {
  assert.match(
    source,
    /useState\(submittedFamilySeats\.childSeatCount > 0\)/,
  );
  assert.match(source, /combinedSelection && isKidsSectionExpanded/);
});

test("desktop and mobile triggers expose the same accessible child-seat panel", () => {
  assert.equal((source.match(/Bringing Kids 10 &amp; Under\?/g) ?? []).length, 2);
  assert.equal((source.match(/aria-controls="free-child-seat-options"/g) ?? []).length, 2);
  assert.equal((source.match(/aria-expanded=\{isKidsSectionExpanded\}/g) ?? []).length, 2);
  assert.match(source, /id="free-child-seat-options"/);
  assert.match(source, /xl:flex/);
  assert.match(source, /xl:hidden/);
});

test("collapsing the panel does not clear child count or selected seats", () => {
  const toggleHandlers = source.match(
    /onClick=\{\(\) => setIsKidsSectionExpanded\(\(isExpanded\) => !isExpanded\)\}/g,
  );

  assert.equal(toggleHandlers?.length, 2);
  assert.doesNotMatch(source, /setIsKidsSectionExpanded[^\n]+setFreeChildCount/);
  assert.doesNotMatch(source, /setIsKidsSectionExpanded[^\n]+setSelectedSeatIds/);
  assert.match(source, /Math\.min\(3, seatingLink\.child_seat_limit\)/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("reserved-seat confirmation print styles isolate the printable ticket without forcing a page break", () => {
  const sourcePath = fileURLToPath(new URL("./reserved-seat-selection-page.tsx", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");

  assert.match(source, /className="confirmation-print-root/);
  assert.match(source, /\.seat-confirmation-screen\s*\{\s*display:\s*none !important;/);
  assert.match(source, /\.seat-confirmation-print \.ticket-code-block\s*\{\s*break-inside:\s*auto !important;/);
  assert.doesNotMatch(source, /body \* \{\s*visibility:\s*hidden;/);
});

test("unassigned auto-assign requests replace the seat map with a reversible waiting screen", () => {
  const sourcePath = fileURLToPath(new URL("./reserved-seat-selection-page.tsx", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");
  const waitingScreenIndex = source.indexOf('if (seatPreference === "auto_assign" && linkAssignments.length === 0 && !isAlreadySubmitted)');
  const seatMapRenderIndex = source.indexOf("<ReservedSeatMap");

  assert.ok(waitingScreenIndex >= 0);
  assert.ok(seatMapRenderIndex > waitingScreenIndex);
  assert.match(source, /🤝/);
  assert.match(source, /Auto Assignment Requested/);
  assert.match(source, /You do not need to select seats unless you change your mind\./);
  assert.match(source, /saveSeatPreference\("customer_select"\)/);
  assert.match(source, /setSeatPreference\(preference\)/);
  assert.match(source, /href="https:\/\/www\.cumberlandmountainmusic\.com\/show-dates"/);
  assert.doesNotMatch(source, /window\.history\.back\(\)/);
});

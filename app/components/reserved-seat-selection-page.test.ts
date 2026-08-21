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
test("public seat selection hides Entry Code while preserving the final printable ticket code", () => {
  const sourcePath = fileURLToPath(new URL("./reserved-seat-selection-page.tsx", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");
  const selectionSummaryStart = source.indexOf(">Selection Summary<");
  const printTicketStart = source.indexOf('className="seat-confirmation-print');
  const publicSelectionMarkup = source.slice(selectionSummaryStart, printTicketStart);

  assert.ok(selectionSummaryStart >= 0);
  assert.ok(printTicketStart > selectionSummaryStart);
  assert.doesNotMatch(publicSelectionMarkup, /<ReservationTicketCode/);
  assert.doesNotMatch(publicSelectionMarkup, /Your Entry Code/);
  assert.equal(source.match(/<ReservationTicketCode/g)?.length, 1);
  assert.match(source.slice(printTicketStart), /<ReservationTicketCode[\s\S]*scanToken=\{seatingLink\.scan_token\}/);
  assert.match(source, /<ReservedSeatMap/);
  assert.match(source, /saveSeatPreference\("auto_assign"\)/);
  assert.match(source, /mailingListOptIn/);
});


test("unassigned auto-assign requests replace the seat map with a reversible waiting screen", () => {
  const sourcePath = fileURLToPath(new URL("./reserved-seat-selection-page.tsx", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");
  const waitingScreenIndex = source.indexOf('if (seatPreference === "auto_assign" && linkAssignments.length === 0 && !isAlreadySubmitted)');
  const seatMapRenderIndex = source.indexOf("<ReservedSeatMap");

  assert.ok(waitingScreenIndex >= 0);
  assert.ok(seatMapRenderIndex > waitingScreenIndex);
  assert.match(source, /🤝/);
  assert.match(source, /We&apos;ve Got It From Here!/);
  assert.match(source, /We&apos;ll choose the best available seats for your party/);
  assert.match(source, /saveSeatPreference\("customer_select"\)/);
  assert.match(source, /setSeatPreference\(preference\)/);
  assert.match(source, /href="https:\/\/www\.cumberlandmountainmusic\.com\/show-dates"/);
  assert.doesNotMatch(source, /window\.history\.back\(\)/);
});

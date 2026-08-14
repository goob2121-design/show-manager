import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const reservedToolsUrl = new URL("reserved-seating-panel.tsx", import.meta.url);
const reportsUrl = new URL("ticket-reports-panel.tsx", import.meta.url);
const printPageUrl = new URL("../../admin/[slug]/print/[kind]/page.tsx", import.meta.url);

test("seat-card and comp-list utilities live in Reports and Printouts only", async () => {
  const [reservedTools, reports] = await Promise.all([
    readFile(reservedToolsUrl, "utf8"),
    readFile(reportsUrl, "utf8"),
  ]);

  for (const label of [
    "Print Comp Reserved Seat Cards",
    "Print Back-Up / Blank Seat Cards",
    "Print Comp List",
    "Export Comp List PDF",
  ]) {
    assert.doesNotMatch(reservedTools, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(reports, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(reports, /print\/comp-reserved-seat-cards/);
  assert.match(reports, /print\/blank-seat-cards/);
  assert.match(reports, /onClick=\{onPrintCompList\}/);
  assert.match(reports, /onClick=\{onExportCompListPdf\}/);
});

test("selected chair cards omit admission codes and emphasize assignment details", async () => {
  const source = await readFile(printPageUrl, "utf8");
  const selectedStart = source.indexOf("function SelectedReservedSeatCardsPrintView");
  const selectedEnd = source.indexOf("function cleanPrintStudioRecord", selectedStart);
  assert.notEqual(selectedStart, -1);
  assert.notEqual(selectedEnd, -1);
  const selectedCards = source.slice(selectedStart, selectedEnd);

  assert.doesNotMatch(selectedCards, /ReservationTicketCode/);
  assert.doesNotMatch(selectedCards, /scanToken/);
  assert.doesNotMatch(selectedCards, /ticket_code_format/);
  assert.match(selectedCards, /src="\/cmms-logo\.png"/);
  assert.match(selectedCards, /Reserved Seating/);
  assert.doesNotMatch(selectedCards, /formatShowDate\(show\.show_date\)/);
  assert.doesNotMatch(selectedCards, /is_complimentary/);
  assert.doesNotMatch(selectedCards, /source_note/);
  assert.doesNotMatch(selectedCards, /Complimentary/);
  assert.match(selectedCards, /min-h-\[2\.2in\]/);
  assert.match(source, /print:text-\[36px\]/);
  assert.match(selectedCards, /print:text-\[26px\]/);
  assert.match(selectedCards, /Section \{card\.section\} - Row \{card\.row_label\} - Seat \{card\.seat_number\}/);

  assert.match(source.slice(0, selectedStart), /ReservationTicketCode/);
});
test("selected chair cards reserve room for the print header on page one", async () => {
  const source = await readFile(printPageUrl, "utf8");
  const selectedStart = source.indexOf("function SelectedReservedSeatCardsPrintView");
  const selectedEnd = source.indexOf("function cleanPrintStudioRecord", selectedStart);
  const selectedCards = source.slice(selectedStart, selectedEnd);

  assert.match(source, /\.seat-card-sheet-with-header \{[\s\S]*height: 7\.695in !important;[\s\S]*grid-template-rows: repeat\(3, 2\.485in\) !important;/);
  assert.match(selectedCards, /const firstPageCards = seatCards\.slice\(0, 6\);/);
  assert.match(selectedCards, /chunkItems\(seatCards\.slice\(6\), 8\)/);
  assert.match(selectedCards, /pageIndex === 0 \? "seat-card-sheet-with-header" : ""/);
  assert.match(selectedCards, /breakInside: "avoid"/);
  assert.match(selectedCards, /pageBreakInside: "avoid"/);
});


test("selected chair-card names use fixed no-wrap print sizing without changing pagination", async () => {
  const source = await readFile(printPageUrl, "utf8");
  const selectedStart = source.indexOf("function SelectedReservedSeatCardsPrintView");
  const selectedEnd = source.indexOf("function cleanPrintStudioRecord", selectedStart);
  const selectedCards = source.slice(selectedStart, selectedEnd);

  assert.match(source, /characterCount <= 20\) return "print:text-\[36px\]"/);
  assert.equal("Sara Bumgardner".length <= 20, true);
  assert.match(source, /if \(Array\.from\(trimmedName\)\.length <= 26\) return trimmedName;/);
  assert.match(source, /return words\.slice\(0, 2\)\.join\(" "\);/);
  assert.match(source, /words\.slice\(0, ampersandIndex \+ 2\)\.join\(" "\)/);
  assert.equal("Peace Keepers Firearms Training".split(/\s+/).slice(0, 2).join(" "), "Peace Keepers");
  assert.equal("Stanifer & Stanifer".length <= 26, true);
  assert.match(selectedCards, /getSelectedSeatCardNamePrintClass\(printName\)/);
  assert.match(selectedCards, /<span className="print:hidden">\{customerName\}<\/span>/);
  assert.match(selectedCards, /<span className="hidden print:block">\{printName\}<\/span>/);
  assert.match(selectedCards, /print:h-\[0\.45in\]/);
  assert.match(selectedCards, /print:whitespace-nowrap/);
  assert.match(selectedCards, /print:overflow-hidden/);
  assert.match(selectedCards, /print:text-ellipsis/);
  assert.match(selectedCards, /const firstPageCards = seatCards\.slice\(0, 6\);/);
  assert.match(selectedCards, /chunkItems\(seatCards\.slice\(6\), 8\)/);
});

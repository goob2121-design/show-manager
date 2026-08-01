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
  assert.match(selectedCards, /formatShowDate\(show\.show_date\)/);
  assert.match(selectedCards, /min-h-\[2\.2in\]/);
  assert.match(selectedCards, /print:text-\[36px\]/);
  assert.match(selectedCards, /print:text-\[26px\]/);
  assert.match(selectedCards, /Section \{card\.section\} - Row \{card\.row_label\} - Seat \{card\.seat_number\}/);

  assert.match(source.slice(0, selectedStart), /ReservationTicketCode/);
});
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const printPageUrl = new URL("../../admin/[slug]/print/[kind]/page.tsx", import.meta.url);
const panelUrl = new URL("../reserved-seating-panel.tsx", import.meta.url);

test("Seat Map & Roster is available in the existing reserved-seat print workflow", async () => {
  const [page, panel] = await Promise.all([readFile(printPageUrl, "utf8"), readFile(panelUrl, "utf8")]);
  assert.match(panel, /print\/seat-map-roster/);
  assert.match(panel, /Print Seat Map &amp; Roster/);
  assert.match(page, /kind === "seat-map-roster"/);
  assert.match(page, /return "Seat Map & Roster"/);
  assert.match(page, /<SeatMapRosterPrintView/);
});

test("print report uses shared seat definitions and read-only report data", async () => {
  const page = await readFile(printPageUrl, "utf8");
  const start = page.indexOf("function SeatMapRosterPrintView");
  const end = page.indexOf("function cleanPrintStudioRecord", start);
  const report = page.slice(start, end);
  assert.match(report, /buildReservedSeatMapRosterReport\(assignments, reservedLinks\)/);
  assert.match(report, /RESERVED_SEATING_SECTION_LABELS/);
  assert.match(report, /RESERVED_SEATING_ROW_LABELS/);
  assert.match(report, /seat\.status === "assigned"/);
  assert.match(report, /seat\.status === "unavailable"/);
  assert.match(report, /report\.roster/);
  assert.match(report, /report\.nss/);
  assert.doesNotMatch(report, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("screen report stays readable in StageFlow dark mode", async () => {
  const page = await readFile(printPageUrl, "utf8");
  assert.match(page, /html\.dark \.seat-map-roster-report \{ color: #f8fafc !important; \}/);
  assert.match(page, /html\.dark \.seat-map-roster-summary > div,[\s\S]*html\.dark \.seat-map-roster-table td,[\s\S]*color: #f8fafc !important;/);
  assert.match(page, /html\.dark \.seat-map-seat-available \{[\s\S]*color: #f8fafc !important;/);
  assert.match(page, /html\.dark \.seat-map-seat-assigned \{[\s\S]*background: #f8fafc !important;[\s\S]*color: #020617 !important;/);
  assert.match(page, /seat-map-seat-assigned bg-white text-black/);
  assert.match(page, /seat-map-legend-assigned[^"]*bg-white/);
});

test("print map uses structural seat indicators and avoids blank/split regressions", async () => {
  const page = await readFile(printPageUrl, "utf8");
  assert.match(page, /@page \{ size: letter landscape;/);
  assert.match(page, /\.seat-map-seat-assigned \{[\s\S]*background: #000000 !important;[\s\S]*border: 2pt solid #000000 !important;[\s\S]*color: #ffffff !important;[\s\S]*font-size: 11px !important;[\s\S]*print-color-adjust: exact !important;/);
  assert.match(page, /\.seat-map-seat-assigned \*,[\s\S]*html\.dark \.seat-map-seat-assigned \* \{[\s\S]*color: #ffffff !important;/);
  assert.match(page, /html\.dark \.seat-map-seat-assigned \{[\s\S]*background: #000000 !important;[\s\S]*border: 2pt solid #000000 !important;/);
  assert.match(page, /\.seat-map-seat-available \{[^}]*background: #ffffff !important;[^}]*color: #000000 !important;[^}]*font-size: 11px !important;/);
  assert.match(page, /\.seat-map-seat-unavailable \{[\s\S]*border: 3px double #000000 !important;/);
  assert.match(page, /\.seat-map-seat-available \{[^}]*font-size: 11px !important;[^}]*font-weight: 800 !important;/);
  assert.match(page, /seat-map-legend-assigned,[\s\S]*background: #000000 !important;[\s\S]*print-color-adjust: exact !important;/);
  assert.match(page, /seat-map-roster-print-shell/);
  assert.match(page, /\.seat-map-roster-print-shell > header,[\s\S]*\.seat-map-roster-table td \*,[\s\S]*color: #000000 !important;/);
  assert.match(page, /-webkit-text-fill-color: #000000 !important;/);
  assert.match(page, /seat-map-legend-unavailable[\s\S]{0,200}>\/<\/span>[\s\S]{0,50}Unavailable/);
  assert.match(page, /\.seat-map-roster-map-page \{[\s\S]*break-after: page;[\s\S]*page-break-inside: avoid;/);
  assert.doesNotMatch(page, /break-before:\s*page|page-break-before:\s*always/);
  assert.doesNotMatch(page, /\.seat-map-roster-table\s*\{[\s\S]{0,100}page-break-inside: avoid/);
  assert.match(page, /\.seat-map-roster-table tr,[\s\S]*page-break-inside: avoid;/);
  assert.match(page, /\.seat-map-roster-report,[\s\S]*background: #ffffff !important;/);
  assert.match(page, /\.seat-map-roster-table th,[\s\S]*background: #f5f5f4 !important;/);
});

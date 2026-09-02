import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packetModulePromise = import(new URL("./sponsor-packet.ts", import.meta.url).href);
const componentPath = new URL("../app/components/sponsor-packet-builder.tsx", import.meta.url);
const seatMapPath = new URL("../app/components/reserved-seat-map.tsx", import.meta.url);

function componentSource() { return readFile(componentPath, "utf8"); }
function seatMapSource() { return readFile(seatMapPath, "utf8"); }

test("seat summary groups consecutive seats by section and row", async () => {
  const { buildSponsorPacketSeatSummary } = await packetModulePromise;
  const summary = buildSponsorPacketSeatSummary(["L-C1", "L-C2", "L-C3", "R-A10"]);

  assert.deepEqual(summary.invalidSeatIds, []);
  assert.deepEqual(summary.validSeatIds, ["L-C1", "L-C2", "L-C3", "R-A10"]);
  assert.equal(summary.groups.length, 2);
  assert.equal(summary.groups[0]?.summaryLabel, "Left Section, Row C: Seats 1–3");
  assert.equal(summary.groups[1]?.summaryLabel, "Right Section, Row A: Seat 10");
});

test("seat summary ignores invalid seat ids without exposing them in groups", async () => {
  const { buildSponsorPacketSeatSummary } = await packetModulePromise;
  const summary = buildSponsorPacketSeatSummary(["L-B1", "BAD-SEAT", "R-Z99"]);

  assert.deepEqual(summary.validSeatIds, ["L-B1"]);
  assert.deepEqual(summary.invalidSeatIds, ["BAD-SEAT", "R-Z99"]);
  assert.equal(summary.groups.length, 1);
  assert.equal(summary.groups[0]?.rowLabel, "B");
});

test("packet renders the official admission pass before a separate reserved-seat location map", async () => {
  const source = await componentSource();

  assert.match(source, /buildSponsorPacketSeatSummary/);
  assert.match(source, /buildSponsorAdmissionPasses/);
  assert.match(source, /OFFICIAL ADMISSION PASS/);
  assert.match(source, /Present this page at the door/);
  assert.match(source, /Your Reserved Seat Location/);
  assert.match(source, /Your reserved seats are highlighted below so you can easily see their location in the auditorium\./);
  assert.match(source, /hasAdmissionPass \? "admission-pass"[\s\S]*hasSeatLocationPage \? "seat-location"/);
  assert.match(source, /Highlighted seats are reserved for \{admissionPass\?\.sponsorName \|\| draft\.sponsorName\}/);
  assert.match(source, /packet-ticket-map-heading/);
  assert.match(source, /legendVariant="sponsor-packet"/);
  assert.match(source, /chromeVariant="sponsor-packet"/);
  assert.match(source, /sizeVariant="compact"/);
  assert.doesNotMatch(source, /<strong>Assigned seats:<\/strong>/);
  assert.doesNotMatch(source, />Ticket Information</);
  assert.doesNotMatch(source, />Complimentary Admission</);
  const seatLocationMarkup = source.slice(source.indexOf("{hasSeatLocationPage ? <article"), source.indexOf("pageNumberFor(\"seat-location\")"));
  assert.doesNotMatch(seatLocationMarkup, /ReservationTicketCode|Entry Code|barcode/);
});

test("seat-location page preserves the optional map toggle and pass-not-ready safety", async () => {
  const source = await componentSource();

  assert.match(source, /Admission Pass Not Ready/);
  assert.match(source, /reservedSeatLocationMap: true/);
  assert.match(source, /Include Reserved Seat Location Map/);
  assert.match(source, /showReservedSeatMap = showReservedSeatSummary && presentationSections\.reservedSeatLocationMap/);
});

test("reserved seat map supports sponsor packet legend and neutral print styling", async () => {
  const source = await seatMapSource();

  assert.match(source, /legendVariant\?: "customer" \| "public" \| "admin" \| "door-readonly" \| "sponsor-packet"/);
  assert.match(source, /chromeVariant\?: "stageflow" \| "cmms-public" \| "sponsor-packet"/);
  assert.match(source, /sizeVariant\?: "default" \| "compact"/);
  assert.match(source, /const sponsorPacketLegendItems = \[\s*\{ label: "Your Reserved Seats", classes: "border-\[#5f430f\] bg-\[#d6af45\] text-\[#1f1505\]"/);
  assert.doesNotMatch(source, /const sponsorPacketLegendItems = \[[\s\S]*Other Seats/);
  assert.match(source, /min-w-\[620px\]/);
  assert.match(source, /flex flex-wrap items-center justify-center/);
  assert.match(source, /w-full max-w-full overflow-hidden text-\[#050505\] shadow-none/);
  assert.match(source, /status === "selected"[\s\S]*border-\[#5f430f\] bg-\[#d6af45\] text-\[#1f1505\]/);
  assert.match(source, /cursor-not-allowed border-stone-400 bg-stone-100 text-stone-600 opacity-100/);
  assert.match(source, /\.packet-sponsor-seat--selected,\s*\.packet-sponsor-seat-legend \{[\s\S]*background-color: #d4a72c !important;[\s\S]*border-color: #5a4300 !important;[\s\S]*-webkit-print-color-adjust: exact !important;[\s\S]*print-color-adjust: exact !important;[\s\S]*box-shadow: inset 0 0 0 999px #d4a72c !important;/);
  assert.match(source, /\.packet-sponsor-seat--neutral \{[\s\S]*background-color: #f5f5f4 !important;[\s\S]*border-color: #a8a29e !important;[\s\S]*-webkit-print-color-adjust: exact !important;/);
  assert.match(source, /packet-sponsor-seat-map/);
  assert.match(source, /packet-sponsor-seat--selected/);
  assert.match(source, /packet-sponsor-seat--neutral/);
  assert.match(source, /packet-sponsor-seat-legend/);
});

test("print css keeps the separate seat-location summary and map together with compact packet sizing", async () => {
  const source = await componentSource();

  assert.match(source, /\.packet-ticket-seat-summary,\s*\.packet-ticket-seat-map \{ break-inside: avoid; page-break-inside: avoid; \}/);
  assert.match(source, /\.packet-seat-location-page \{ font-size: 9\.85pt !important; line-height: 1\.28 !important; \}/);
  assert.match(source, /\.packet-page \.text-stone-600,[\s\S]*color: #333333 !important;/);
  assert.match(source, /\.packet-seat-location-page \.packet-ticket-content \{ margin-top: 0\.5rem !important; padding: 0 !important; border: 0 !important;/);
  assert.match(source, /packet-cover-title packet-heading mt-3 text-4xl font-bold text-stone-900 print:text-\[#111111\]/);
  assert.match(source, /\.packet-cover-page \.packet-cover-title \{ color: #111111 !important; font-weight: 800 !important; opacity: 1 !important; -webkit-text-fill-color: #111111 !important; \}/);
  assert.match(source, /\.packet-show-page \.packet-section-heading \{ color: #0f5c53 !important; border-color: #0f5c53 !important;[\s\S]*font-weight: 700 !important;/);
  assert.match(source, /\.packet-seat-location-page \.packet-ticket-seat-summary \{[\s\S]*border-left: 2\.5px solid #0f5c53 !important;[\s\S]*color: #050505 !important;/);
  assert.match(source, /\.packet-seat-location-page \.packet-ticket-seat-summary \.packet-ticket-seat-summary-heading \{[\s\S]*font-weight: 700 !important;[\s\S]*color: #7a5a14 !important;/);
  assert.match(source, /\.packet-seat-location-page \.packet-ticket-seat-summary \.packet-ticket-seat-id-value \{ color: #050505 !important; font-weight: 700 !important; \}/);
  assert.match(source, /\.packet-seat-location-page \.packet-seat-map-frame \{ padding: 0 !important; border: 1px solid #a8a29e !important;.*transform: scale\(0\.74\);/);
  assert.match(source, /\.packet-seat-location-page \.packet-ticket-map-heading \{ margin-top: 0\.4rem !important; padding-top: 0\.22rem !important; border-top: 1px solid #0f5c53 !important; \}/);
});

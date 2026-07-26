import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  addRecentGuestCheckIn,
  admissionMatchesDoorSearch,
  attendanceProgressPercent,
  expectedDoorAttendance,
  explicitSeatLabel,
  isAdmissionFullyCheckedIn,
  normalizeDoorReservedSeatIds,
  parseDoorReservedSeatIds,
  visibleDoorModeNote,
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "./door-mode-presentation.ts";

const doorModePath = new URL("../app/components/door-mode-page.tsx", import.meta.url);

test("search matches prepaid names case-insensitively and trims spaces", () => {
  const admission = { guest_name: "Pamela Blevins", ticket_type: "paid_online", notes: null };
  assert.equal(admissionMatchesDoorSearch(admission, "Paid Reserved", "  pamela  "), true);
  assert.equal(admissionMatchesDoorSearch(admission, "Paid Reserved", "someone else"), false);
});

test("search matches special-admission categories and explicit seat labels", () => {
  const admission = { guest_name: "Stuart Wyrick", ticket_type: "complimentary", notes: "[Seats: L-C4, L-C5]" };
  assert.equal(admissionMatchesDoorSearch(admission, "Band Comp", "band"), true);
  assert.equal(admissionMatchesDoorSearch(admission, "Band Comp", "l-c5"), true);
  assert.equal(explicitSeatLabel(admission.notes), "L-C4, L-C5");
});

test("empty search restores all cards and recent guest check-ins stay bounded to five", () => {
  const admission = { guest_name: "Guest", ticket_type: "complimentary", notes: null };
  assert.equal(admissionMatchesDoorSearch(admission, "Guest Comp", "   "), true);
  const actions = Array.from({ length: 7 }, (_, index) => ({
    id: String(index),
    guestName: `Guest ${index}`,
    quantity: 1,
    resultingTotal: index + 1,
    ticketCount: 7,
    createdAt: index,
  })).reduce(addRecentGuestCheckIn, []);
  assert.equal(actions.length, 5);
});

test("Door Mode renders date-only show_date without local timezone rollback", async () => {
  const source = await readFile(doorModePath, "utf8");
  assert.match(source, /timeZone: "UTC"/);
  const rendered = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date("2026-08-15"));
  assert.equal(rendered, "Saturday, August 15, 2026");
});
test("Door Mode keeps print routes, native sections, feedback, and existing mutation call count", async () => {
  const source = await readFile(doorModePath, "utf8");
  assert.match(source, /print\/door-guest-list/);
  assert.match(source, /print\/reserved-seat-cards/);
  assert.match(source, /print\/blank-seat-cards/);
  assert.match(source, /Paid Door Tickets/);
  assert.match(source, /Sponsor Comp Tickets/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Back to Admin/);
  assert.match(source, />\s*Connected\s*</i);
  assert.equal((source.match(/\.from\("show_comp_tickets"\)\s*\n\s*\.update\(/g) ?? []).length, 4);
});
test("attendance progress uses loaded admission quantities and hides when expected is zero", () => {
  assert.equal(expectedDoorAttendance([{ ticket_count: 2 }, { ticket_count: 3 }], 4), 9);
  assert.equal(attendanceProgressPercent(6, 9), 67);
  assert.equal(attendanceProgressPercent(0, 0), null);
});

test("completed admission state uses checked-in counts only", () => {
  assert.equal(isAdmissionFullyCheckedIn(2, 2), true);
  assert.equal(isAdmissionFullyCheckedIn(1, 2), false);
});

test("Door Mode removes visible stat cards but preserves dynamic header and operational sections", async () => {
  const source = await readFile(doorModePath, "utf8");
  assert.doesNotMatch(source, /xl:grid-cols-6/);
  assert.match(source, /Door Check-In/);
  assert.match(source, /src="\/cmms-logo\.png"/);
  assert.match(source, /formatShowDate\(show\.show_date\)/);
  assert.match(source, /show\.venue/);
  assert.doesNotMatch(source, /data-testid="door-attendance-progress"/);
  assert.doesNotMatch(source, /Tonight&apos;s Attendance/);
  assert.match(source, /isAdmissionFullyCheckedIn/);
  assert.match(source, /Prepaid \/ Online Check-In/);
  assert.match(source, /Paid Door Tickets/);
  assert.match(source, /Special Admissions/);
  assert.match(source, /Sponsor Comp Tickets/);
  assert.match(source, /View Totals/);
  assert.match(source, /handleAddDoorSale/);
  assert.match(source, /sponsor\.comp_tickets_checked_in/);
  assert.equal((source.match(/fetch\(/g) ?? []).length, 1);
  assert.match(source, /door-seat-assignments\?slug=/);
});
test("Door Mode uses compact search and a collapsed session-only Recent disclosure", async () => {
  const source = await readFile(doorModePath, "utf8");
  assert.match(source, /placeholder="Search guests\.\.\."/);
  assert.doesNotMatch(source, /Search prepaid and special-admission guests by name/);
  assert.match(source, /useState\(false\)[\s\S]*isRecentCheckInsOpen|isRecentCheckInsOpen[\s\S]*useState\(false\)/);
  assert.match(source, /aria-expanded=\{isRecentCheckInsOpen\}/);
  assert.match(source, /aria-controls="door-recent-check-ins"/);
  assert.match(source, /Recent \(\{recentGuestCheckIns\.length\}\)/);
  assert.match(source, /useState<RecentGuestCheckIn\[\]>\(\[\]\)/);
  assert.match(source, /setTimeout\(\(\) => setCheckInConfirmation\(null\), 3500\)/);
  assert.ok(source.indexOf('placeholder="Search guests..."') < source.indexOf("Prepaid / Online Check-In"));
});
test("Door Mode toolbar is compact on desktop and safely stacked on mobile", async () => {
  const source = await readFile(doorModePath, "utf8");
  assert.match(source, /data-testid="door-operational-toolbar"/);
  assert.match(source, /flex flex-col gap-2 md:flex-row md:items-center/);
  assert.match(source, /flex w-full gap-2 md:min-w-\[280px\] md:max-w-\[380px\]/);
  assert.match(source, /placeholder="Search guests\.\.\."/);
  assert.match(source, /aria-label="Clear guest search"/);
  assert.match(source, /setGuestSearch\(""\)/);
  assert.match(source, /aria-label="Sponsor Comp Tickets"/);
  assert.match(source, /aria-label="View Totals"/);
  assert.match(source, /aria-label="Recent Check-Ins"/);
  assert.match(source, /<div aria-label="Connected"/);
  assert.doesNotMatch(source, /<button[^>]*aria-label="Connected"/);
  assert.doesNotMatch(source, /overflow-x/);
  assert.ok(source.indexOf("Back to Admin") < source.indexOf('data-testid="door-operational-toolbar"'));
});
test("Door Mode hero shows one dynamic title with centered clock and right-side status", async () => {
  const source = await readFile(doorModePath, "utf8");
  assert.doesNotMatch(source, />Cumberland Mountain Music Show</);
  assert.equal((source.match(/\{show\.name\}/g) ?? []).length, 0);
  assert.match(source, /lg:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(source, /lg:text-center[\s\S]*\{formattedCurrentTime\}/);
  assert.match(source, /Door Check-In[\s\S]*aria-label="Connected"/);
  assert.match(source, /px-3 py-2 sm:px-4 sm:py-3/);
  assert.match(source, /formatShowDate\(show\.show_date\)/);
  assert.match(source, /&larr; Back to Admin/);
});
test("Door Mode uses the modern navy and gray presentation palette", async () => {
  const source = await readFile(doorModePath, "utf8");
  assert.match(source, /min-h-screen bg-gray-900/);
  assert.match(source, /bg-slate-900/);
  assert.match(source, /bg-gray-800/);
  assert.match(source, /border-gray-700/);
  assert.match(source, /text-gray-400/);
  assert.match(source, /text-gray-50/);
  assert.doesNotMatch(source, /stone-/);
  assert.doesNotMatch(source, /bg-black/);
  assert.match(source, /Sponsor Comps/);
  assert.match(source, /border-amber-700/);
});
test("Door Mode hero uses the official compact CMMS logo without duplicating title text", async () => {
  const source = await readFile(doorModePath, "utf8");
  assert.match(source, /src="\/cmms-logo\.png"/);
  assert.match(source, /alt="Cumberland Mountain Music Show"/);
  assert.match(source, /width=\{500\}[\s\S]*height=\{300\}/);
  assert.match(source, /className="h-9 w-auto max-w-full object-contain sm:h-12"/);
  assert.doesNotMatch(source, /<h1[^>]*>\{show\.name\}<\/h1>/);
  assert.match(source, /lg:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(source, /\{formattedCurrentTime\}/);
  assert.match(source, /Door Check-In[\s\S]*aria-label="Connected"/);
  assert.match(source, /px-3 py-2 sm:px-4 sm:py-3/);
  assert.doesNotMatch(source, /overflow-x/);
});
test("View Seats eligibility requires safely parsed canonical assigned seat IDs", () => {
  assert.deepEqual(normalizeDoorReservedSeatIds(["L-C5", "L-C4"], ["L-C4", "L-C5"]), ["L-C4", "L-C5"]);
  assert.deepEqual(parseDoorReservedSeatIds("[Seats: L-C5, L-C4]", ["L-C4", "L-C5"]), ["L-C4", "L-C5"]);
  assert.deepEqual(parseDoorReservedSeatIds("General admission, quantity 2", ["L-C4", "L-C5"]), []);
  assert.deepEqual(parseDoorReservedSeatIds("[Seats: quantity 2]", ["L-C4", "L-C5"]), []);
  assert.deepEqual(parseDoorReservedSeatIds("[Seats: L-C4, unknown]", ["L-C4", "L-C5"]), []);
});

test("Door Mode seat dialog is canonical, accessible, focus-safe, and read-only", async () => {
  const source = await readFile(doorModePath, "utf8");
  assert.match(source, /normalizeDoorReservedSeatIds\([\s\S]*seatIdsByTicketId\[item\.id\]/);
  assert.doesNotMatch(source, /parseDoorReservedSeatIds\(item\.notes, DOOR_RESERVED_SEAT_IDS\)/);
  assert.match(source, /aria-label=\{`View seats \$\{seatIds\.join\(" and "\)\} for \$\{item\.guest_name\}`\}/);
  assert.match(source, /setSeatView\(\{/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /seatDialogCloseButtonRef\.current\?\.focus\(\)/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /trigger\.focus\(\)/);
  assert.match(source, /inert=\{Boolean\(seatView\)\}/);
  assert.match(source, /<ReservedSeatMap/);
  assert.match(source, /legendVariant="door-readonly"/);
  assert.match(source, /showCustomerSeatDetails=\{false\}/);
  assert.match(source, /Reserved Seats: \{seatView\.seatIds\.join\(", "\)\}/);
  const dialogSource = source.slice(source.indexOf('data-testid="door-seat-dialog"'));
  assert.doesNotMatch(dialogSource, />\s*(Assign|Move|Clear Seats|Save|Check In)\s*</i);
  assert.equal((source.match(/\.from\("show_comp_tickets"\)\s*\n\s*\.update\(/g) ?? []).length, 4);
  assert.doesNotMatch(source, /api\/integrations\/square|ticket-ingestion|send-reserved-seat-link-email/);
});

test("Paid Door remains a compact responsive strip with its existing controls and behavior", async () => {
  const source = await readFile(doorModePath, "utf8");
  assert.match(source, /data-testid="paid-door-compact-strip"/);
  assert.match(source, />Paid Door Tickets</);
  assert.match(source, /Current: \{doorPaidTickets\}/);
  assert.match(source, /\{\[1, 2, 5\]\.map\(\(quantity\) => \(/);
  assert.match(source, /onClick=\{\(\) => void handleAddDoorSale\(quantity\)\}/);
  assert.match(source, /disabled=\{Boolean\(activeActionId\)\}/);
  assert.match(source, /onClick=\{\(\) => void handleSubtractDoorSale\(\)\}/);
  assert.match(source, /disabled=\{Boolean\(activeActionId\) \|\| doorPaidTickets <= 0\}/);
  assert.match(source, />\s*-1\s*</);
  assert.match(source, /onClick=\{\(\) => void handleUndoLastAction\(\)\}/);
  assert.match(source, /disabled=\{Boolean\(activeActionId\) \|\| recentActivities\.length === 0\}/);
  assert.match(source, />\s*Undo Last\s*</);

  const compactStripIndex = source.indexOf('data-testid="paid-door-compact-strip"');
  const specialAdmissionsIndex = source.indexOf("Special Admissions", compactStripIndex);
  assert.ok(compactStripIndex >= 0);
  assert.ok(specialAdmissionsIndex > compactStripIndex);

  const compactSection = source.slice(compactStripIndex, specialAdmissionsIndex);
  assert.match(compactSection, /xl:flex-row/);
  assert.match(compactSection, /grid grid-cols-3/);
  assert.match(compactSection, /sm:flex-wrap/);
  assert.match(compactSection, /min-h-11/);
  assert.doesNotMatch(compactSection, /overflow-x/);
  assert.match(source.slice(Math.max(0, compactStripIndex - 80), compactStripIndex), /flex flex-col gap-3/);
});

test("Door Mode suppresses only the exact misleading legacy Square note", () => {
  const legacyNote = "Imported from Square Sandbox webhook. Purchaser email not sent in Phase 1.";
  assert.equal(visibleDoorModeNote(legacyNote), null);
  assert.equal(visibleDoorModeNote("Please seat near the aisle."), "Please seat near the aisle.");
  assert.equal(
    visibleDoorModeNote("Imported from Square Sandbox webhook. Purchaser email not sent in Phase 1. Follow up."),
    "Imported from Square Sandbox webhook. Purchaser email not sent in Phase 1. Follow up.",
  );
  assert.equal(
    visibleDoorModeNote("[Admission Type: reserved] Prepared from paid reserved seating admission."),
    "[Admission Type: reserved] Prepared from paid reserved seating admission.",
  );
});

test("Door Mode applies visible-note filtering only at Details rendering", async () => {
  const source = await readFile(doorModePath, "utf8");
  assert.equal((source.match(/renderDoorModeNoteDetails\(item\.notes\)/g) ?? []).length, 2);
  assert.match(source, /checkInAdmissionLabel\(item\.ticket_type, item\.notes\)/);
  assert.match(source, /admissionMatchesDoorSearch/);
  assert.match(source, /handleAdjustTicketCheckIn/);
  assert.doesNotMatch(source, /\.from\("show_comp_tickets"\)\s*\.update\(\{\s*notes:/);
});

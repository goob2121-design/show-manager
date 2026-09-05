import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  doorModeKeypadQuantity,
  eligibleDoorModeKeypadQuantity,
} from "./door-mode-keyboard-shortcuts.ts";

const doorModeUrl = new URL("../app/components/door-mode-page.tsx", import.meta.url);
const scanRouteUrl = new URL("../app/api/admin/shows/[showId]/door-scan-lookup/route.ts", import.meta.url);

function context(overrides = {}) {
  return {
    key: "F13",
    repeat: false,
    isEditableTarget: false,
    isScannerTarget: false,
    scannerValue: "",
    scanLookupPending: false,
    actionActive: false,
    modalActive: false,
    shortcutInFlight: false,
    ...overrides,
  };
}

test("F13 through F16 map to paid-door quantities one through four", () => {
  assert.equal(doorModeKeypadQuantity("F13"), 1);
  assert.equal(doorModeKeypadQuantity("F14"), 2);
  assert.equal(doorModeKeypadQuantity("F15"), 3);
  assert.equal(doorModeKeypadQuantity("F16"), 4);
});

test("ordinary number keys and unrelated function keys are ignored", () => {
  for (const key of ["1", "2", "3", "4", "F12", "F17", "Enter"]) {
    assert.equal(doorModeKeypadQuantity(key), null);
  }
});

test("repeat, editable controls, pending scans, active actions, modals, and in-flight shortcuts are ignored", () => {
  assert.equal(eligibleDoorModeKeypadQuantity(context({ repeat: true })), null);
  assert.equal(eligibleDoorModeKeypadQuantity(context({ isEditableTarget: true })), null);
  assert.equal(eligibleDoorModeKeypadQuantity(context({ scanLookupPending: true })), null);
  assert.equal(eligibleDoorModeKeypadQuantity(context({ actionActive: true })), null);
  assert.equal(eligibleDoorModeKeypadQuantity(context({ modalActive: true })), null);
  assert.equal(eligibleDoorModeKeypadQuantity(context({ shortcutInFlight: true })), null);
});

test("empty scanner-ready input permits shortcuts but partial scanner text blocks them", () => {
  assert.equal(eligibleDoorModeKeypadQuantity(context({ key: "F16", isEditableTarget: true, isScannerTarget: true, scannerValue: "" })), 4);
  assert.equal(eligibleDoorModeKeypadQuantity(context({ isEditableTarget: true, isScannerTarget: true, scannerValue: "   " })), 1);
  assert.equal(eligibleDoorModeKeypadQuantity(context({ isEditableTarget: true, isScannerTarget: true, scannerValue: "stf_PARTIAL" })), null);
});

test("separate completed shortcut presses remain separate eligible sales", () => {
  assert.equal(eligibleDoorModeKeypadQuantity(context({ key: "F16" })), 4);
  assert.equal(eligibleDoorModeKeypadQuantity(context({ key: "F13" })), 1);
});

test("Door Mode listener reuses the canonical sale, confirmation, welcome, activity, and undo path", async () => {
  const source = await readFile(doorModeUrl, "utf8");
  const listener = source.slice(
    source.indexOf("function handleDoorModeKeypadShortcut"),
    source.indexOf("async function handleSubtractDoorSale"),
  );
  assert.match(source, /function handleDoorModeKeypadShortcut\(event: KeyboardEvent\)/);
  assert.match(listener, /event\.preventDefault\(\);[\s\S]*keypadShortcutInFlightRef\.current = true;[\s\S]*handleAddDoorSale\(quantity\)\.finally/);
  assert.doesNotMatch(listener, /\.from\(|\.insert\(/);
  assert.match(listener, /closest\('input, textarea, select, \[contenteditable\]:not\(\[contenteditable="false"\]\)'\)/);
  assert.match(listener, /isTotalsPanelOpen[\s\S]*isSpecialAdmissionsPanelOpen[\s\S]*isSponsorCompPanelOpen[\s\S]*Boolean\(seatView\)[\s\S]*isPrintMenuOpen/);
  assert.match(listener, /querySelector\('\[role="dialog"\]\[aria-modal="true"\]'\)/);
  assert.match(source, /ticket_type: "door_paid"/);
  assert.match(source, /ticket_count: quantity[\s\S]*checked_in: true[\s\S]*checked_in_count: quantity/);
  assert.match(source, /setStatusMessage\(`Added \$\{quantity\} paid door ticket/);
  assert.match(source, /admissionCategory: "Paid Door"/);
  assert.match(source, /label: `Paid door \+\$\{quantity\}`/);
  assert.match(source, /undo:[\s\S]*\.delete\(\)[\s\S]*\.eq\("id", insertedTicket\.id\)/);
});

test("canonical attendance and revenue calculations remain unchanged", async () => {
  const source = await readFile(doorModeUrl, "utf8");
  const listener = source.slice(
    source.indexOf("function handleDoorModeKeypadShortcut"),
    source.indexOf("async function handleSubtractDoorSale"),
  );
  assert.match(source, /const DOOR_TICKET_PRICE = 10;/);
  assert.match(source, /const doorPaidRevenue = doorPaidTickets \* DOOR_TICKET_PRICE;/);
  assert.match(source, /const totalPaidAttendance = doorPaidTickets \+ prepaidOnlineTickets;/);
  assert.match(source, /const totalAttendance =[\s\S]*totalPaidAttendance \+ compCheckedInTickets \+ sponsorCompTicketsCheckedIn \+ manualCheckedInTickets;/);
});

test("normal and sponsor-comp scanner routing remains untouched", async () => {
  const [component, route] = await Promise.all([
    readFile(doorModeUrl, "utf8"),
    readFile(scanRouteUrl, "utf8"),
  ]);
  assert.match(component, /onKeyDown=\{\(event\) => \{[\s\S]*event\.key === "Enter"[\s\S]*handleScannedLookup\(scanInput\)/);
  assert.match(route, /isSponsorCompRedemptionToken\(normalizedToken\)/);
  assert.match(route, /\.eq\("scan_token", normalizedToken\)/);
});

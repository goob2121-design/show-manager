import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const doorModeUrl = new URL("./door-mode-page.tsx", import.meta.url);

test("scanner remains permanently compact without an expand control", async () => {
  const source = await readFile(doorModeUrl, "utf8");

  assert.ok(!source.includes("DOOR_SCANNER_EXPANDED_STORAGE_KEY"));
  assert.ok(!source.includes("isScannerExpanded"));
  assert.ok(!source.includes("door-scanner-details"));
  assert.ok(!source.includes('aria-controls="door-scanner-details"'));
});
test("compact toolbar keeps every primary scanner control available", async () => {
  const source = await readFile(doorModeUrl, "utf8");
  const toolbarIndex = source.indexOf('data-testid="door-scanner-panel"');
  const selectIndex = source.indexOf("<select", toolbarIndex);
  const reviewIndex = source.indexOf("Review Before Check-In", selectIndex);
  const inputIndex = source.indexOf("<input", reviewIndex);
  const keyboardIndex = source.indexOf("void handleScannedLookup(scanInput)", inputIndex);
  const buttonIndex = source.indexOf("onClick={() => void handleScannedLookup(scanInput)}", keyboardIndex);

  assert.ok(toolbarIndex >= 0);
  assert.ok(selectIndex > toolbarIndex);
  assert.ok(reviewIndex > selectIndex);
  assert.ok(inputIndex > reviewIndex);
  assert.ok(keyboardIndex > inputIndex);
  assert.ok(buttonIndex > keyboardIndex);
  assert.ok(source.includes("Scanner Ready"));
  assert.ok(source.includes("Immediate:"));
  assert.ok(source.includes("Last:"));
  assert.ok(source.includes("lg:flex-nowrap"));
});

test("scan results display beneath the toolbar without changing their timeout", async () => {
  const source = await readFile(doorModeUrl, "utf8");

  const toolbarIndex = source.indexOf('data-testid="door-scanner-panel"');
  const resultIndex = source.indexOf('{scanState.kind !== "idle" ? (', toolbarIndex);
  assert.ok(toolbarIndex >= 0 && resultIndex > toolbarIndex);
  assert.ok(source.includes('data-testid="door-scanner-result"'));
  assert.ok(source.includes("DOOR_SCAN_RESULT_TIMEOUT_MS = 12_000"));
  assert.ok(source.includes('if (scanState.kind === "idle" || activeActionId) return'));
  assert.ok(source.includes("setLastScannedGuestName(foundResult.reservation.customerName)"));
  assert.ok(source.includes("Invalid Ticket Code"));
  assert.ok(source.includes("Ticket Not Found"));
  assert.ok(source.includes("Already Checked In"));
});

test("all existing scan result actions and Special Admissions remain wired", async () => {
  const source = await readFile(doorModeUrl, "utf8");

  assert.ok(source.includes("handleAdjustTicketCheckIn(scannedTicket, scannedReservationQuantities.remainingTickets)"));
  assert.ok(source.includes("handleAdjustTicketCheckIn(scannedTicket, 1)"));
  assert.ok(source.includes("handleAdjustTicketCheckIn(scannedTicket, -1)"));
  assert.ok(source.includes("Check In All"));
  assert.ok(source.includes("Search Manually"));
  assert.ok(source.includes("Special Admissions &middot; {specialAdmissionCount}"));
  assert.ok(source.includes("handleAdjustTicketCheckIn(item, 1)"));
});

test("Special Admissions opens from the toolbar in a scrollable modal", async () => {
  const source = await readFile(doorModeUrl, "utf8");
  const paidDoorIndex = source.indexOf('data-testid="paid-door-compact-strip"');
  const specialButtonIndex = source.indexOf(">Special Admissions ({specialAdmissionCount})</button>");
  const sponsorButtonIndex = source.indexOf(">Sponsor Comps</button>");
  const mainLayoutIndex = source.indexOf("<section>", sponsorButtonIndex);
  const mainLayoutEndIndex = source.indexOf("</section>", mainLayoutIndex);
  const modalIndex = source.indexOf("{isSpecialAdmissionsPanelOpen ? (", mainLayoutEndIndex);
  const sponsorModalIndex = source.indexOf("{isSponsorCompPanelOpen ? (", modalIndex);

  assert.ok(paidDoorIndex >= 0 && paidDoorIndex < specialButtonIndex);
  assert.ok(specialButtonIndex < sponsorButtonIndex);
  assert.equal(source.indexOf('data-testid="paid-door-compact-strip"', paidDoorIndex + 1), -1);
  assert.ok(source.includes("setIsSpecialAdmissionsPanelOpen(true)"));
  assert.ok(source.includes("setIsSpecialAdmissionsPanelOpen(false)"));
  assert.ok(mainLayoutIndex > sponsorButtonIndex);
  assert.equal(source.slice(mainLayoutIndex, mainLayoutEndIndex).includes("paid-door-compact-strip"), false);
  assert.ok(modalIndex > mainLayoutEndIndex && modalIndex < sponsorModalIndex);
  assert.ok(source.slice(modalIndex, sponsorModalIndex).includes('role="dialog"'));
  assert.ok(source.slice(modalIndex, sponsorModalIndex).includes("max-w-3xl"));
  assert.ok(source.slice(modalIndex, sponsorModalIndex).includes("flex-1 overflow-y-auto"));
  assert.ok(source.slice(modalIndex, sponsorModalIndex).includes("filteredSpecialAdmissions.map((item)"));
  assert.ok(source.slice(modalIndex, sponsorModalIndex).includes("handleAdjustTicketCheckIn(item, 1)"));
  assert.ok(source.slice(modalIndex, sponsorModalIndex).includes("handleAdjustTicketCheckIn(item, -1)"));
});

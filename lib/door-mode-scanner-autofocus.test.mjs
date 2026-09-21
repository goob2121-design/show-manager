import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const doorModeUrl = new URL("../app/components/door-mode-page.tsx", import.meta.url);

async function source() {
  return readFile(doorModeUrl, "utf8");
}

test("Scanner Auto-Focus defaults on and persists only in local storage", async () => {
  const component = await source();
  assert.match(component, /DOOR_SCANNER_AUTOFOCUS_STORAGE_KEY = "stageflow-door-scanner-autofocus"/);
  assert.match(component, /getItem\(DOOR_SCANNER_AUTOFOCUS_STORAGE_KEY\) !== "false"/);
  assert.match(component, /setItem\(DOOR_SCANNER_AUTOFOCUS_STORAGE_KEY, String\(scannerAutoFocus\)\)/);
  assert.doesNotMatch(component, /scanner_autofocus|scannerAutoFocus[\s\S]{0,80}\.from\(/);
});

test("Scanner Auto-Focus uses the existing input and only focuses at safe requested boundaries", async () => {
  const component = await source();
  assert.match(component, /ref=\{scanInputRef\}/);
  assert.match(component, /function focusScanInput\(\)[\s\S]*scannerFocusRequestedRef\.current = true/);
  assert.match(component, /!scannerAutoFocus[\s\S]*scannerFocusRequestedRef\.current = false/);
  assert.match(component, /isScanLookupPending[\s\S]*pendingDoorSaleQuantity !== null[\s\S]*pendingPayAtDoorTicket[\s\S]*seatView[\s\S]*isPrintMenuOpen/);
  assert.match(component, /isAnotherEditableControl[\s\S]*\[role="dialog"\]\[aria-modal="true"\]/);
  assert.match(component, /requestAnimationFrame\(\(\) => scanInputRef\.current\?\.focus\(\)\)/);
  assert.doesNotMatch(component, /setInterval\([^\n]*focusScanInput/);
});

test("scan outcomes and closed payment workflows queue scanner focus without changing their routes", async () => {
  const component = await source();
  assert.match(component, /setScanState\(\{ kind: "invalid" \}\)[\s\S]*focusScanInput\(\)/);
  assert.match(component, /setScanState\(\{ kind: "not_found" \}\)[\s\S]*focusScanInput\(\)/);
  assert.match(component, /closeDoorSaleConfirmation\(\)[\s\S]*setPendingDoorSaleQuantity\(null\)[\s\S]*focusScanInput\(\)/);
  assert.match(component, /closePayAtDoorConfirmation\(\)[\s\S]*setPendingPayAtDoorTicket\(null\)[\s\S]*focusScanInput\(\)/);
  assert.match(component, /\/api\/admin\/shows\/\$\{encodeURIComponent\(show\.id\)\}\/pay-at-door/);
  assert.match(component, /handleScannedLookup\(scanInput\)/);
});
test("temporary editable controls return to scanner focus after five seconds of inactivity", async () => {
  const component = await source();
  assert.match(component, /DOOR_SCANNER_EDITABLE_IDLE_MS = 5_000/);
  assert.match(component, /document\.addEventListener\("input", resetEditableIdleTimer\)/);
  assert.match(component, /document\.addEventListener\("keydown", resetEditableIdleTimer\)/);
  assert.match(component, /document\.addEventListener\("pointerdown", resetEditableIdleTimer\)/);
  assert.match(component, /scannerEditableIdleElapsedRef\.current = true[\s\S]*focusScanInput\(\)/);
  assert.match(component, /onClick=\{\(\) => \{ setGuestSearch\(""\); focusScanInput\(\); \}\}/);
  assert.match(component, /handleAdjustTicketCheckIn[\s\S]*focusScanInput\(\)/);
});
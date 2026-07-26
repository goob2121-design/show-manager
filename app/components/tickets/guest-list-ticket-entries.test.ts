import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  guestListExpandedStorageKey,
  parseSavedGuestListExpanded,
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "../../../lib/guest-list-collapse.ts";

const componentPath = new URL("./guest-list-ticket-entries.tsx", import.meta.url);
const reportsPath = new URL("./ticket-reports-panel.tsx", import.meta.url);
const reservedPath = new URL("./reserved-seating-panel.tsx", import.meta.url);

test("Guest List defaults expanded and restores a safely scoped saved preference", () => {
  assert.equal(parseSavedGuestListExpanded(null), true);
  assert.equal(parseSavedGuestListExpanded("true"), true);
  assert.equal(parseSavedGuestListExpanded("false"), false);
  assert.equal(guestListExpandedStorageKey("show-a"), "stageflow:guest-list-ticket-entries:show-a:expanded");
  assert.notEqual(guestListExpandedStorageKey("show-a"), guestListExpandedStorageKey("show-b"));
});

test("component presents count, accessible state, and hides collapsed content", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /Guest List \/ Ticket Entries \(\{entryCount\}\)/);
  assert.match(source, /aria-expanded=\{isExpanded\}/);
  assert.match(source, /aria-controls=\{contentId\}/);
  assert.match(source, /hidden=\{!isExpanded\}/);
  assert.match(source, /isExpanded \? children : null/);
  assert.match(source, /setIsExpanded\(\(current\)/);
});

test("Prepare expansion does not overwrite the saved preference", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /forceExpandToken <= 0/);
  assert.match(source, /setIsExpanded\(true\)/);
  const forceEffect = source.slice(source.indexOf("useEffect(() => {\n    if (forceExpandToken"));
  assert.doesNotMatch(forceEffect.split("}, [forceExpandToken]")[0] ?? "", /localStorage\.setItem/);
});

test("duplicate report shortcut is hidden while Reserved Seating backup cards remain", async () => {
  const [reports, reserved] = await Promise.all([
    readFile(reportsPath, "utf8"),
    readFile(reservedPath, "utf8"),
  ]);
  assert.match(reports, /const SHOW_DUPLICATE_BACKUP_GUEST_LIST_CARDS = false/);
  assert.match(reports, /SHOW_DUPLICATE_BACKUP_GUEST_LIST_CARDS \? \(/);
  assert.match(reserved, />\s*Print Back-Up \/ Blank Seat Cards\s*</);
});

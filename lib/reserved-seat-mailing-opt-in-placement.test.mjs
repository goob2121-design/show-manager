import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(root, "app", "components", "reserved-seat-selection-page.tsx"),
  "utf8",
);

test("mailing-list opt-in is placed in the Selection Summary customer card", () => {
  const customerCardStart = source.indexOf(">Customer</p>");
  const payAtDoorStart = source.indexOf("payAtDoorTicket?.isPayAtDoor", customerCardStart);
  const customerCard = source.slice(customerCardStart, payAtDoorStart);

  assert.ok(customerCardStart >= 0);
  assert.match(customerCard, /seatingLink\.email/);
  assert.match(customerCard, /checked=\{mailingListOptIn\}/);
  assert.match(customerCard, /setMailingListOptIn\(event\.target\.checked\)/);
  assert.match(customerCard, /Email me about upcoming shows and special offers\./);
  assert.match(customerCard, /border-t border-white\/10/);
});

test("seat-help section retains its action without an opt-in checkbox", () => {
  const helpStart = source.indexOf("Need a little help choosing your seats?");
  const mapStart = source.indexOf("<ReservedSeatMap", helpStart);
  const helpSection = source.slice(helpStart, mapStart);

  assert.ok(helpStart >= 0);
  assert.match(helpSection, /Choose My Seats for Me/);
  assert.doesNotMatch(helpSection, /checked=\{mailingListOptIn\}/);
});

test("existing opt-in state and both submission payloads remain unchanged", () => {
  assert.match(source, /useState\(false\)/);
  assert.match(source, /mailingListOptIn: preference === "auto_assign" && mailingListOptIn/);
  assert.match(source, /mailingListOptIn,\s*\}\),/);
});

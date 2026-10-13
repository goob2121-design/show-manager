import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const phoneTicketSource = fs.readFileSync(
  path.join(root, "app", "components", "phone-ticket-mode.tsx"),
  "utf8",
);
const reservedSeatSource = fs.readFileSync(
  path.join(root, "app", "components", "reserved-seat-selection-page.tsx"),
  "utf8",
);

test("phone ticket shows a dynamic family admission breakdown only when needed", () => {
  assert.match(phoneTicketSource, /admissionSummary\.hasFreeChildren/);
  assert.match(phoneTicketSource, /\["Paid Admissions"/);
  assert.match(phoneTicketSource, /\["Free Children \(10 & Under\)"/);
  assert.match(phoneTicketSource, /\["Total Guests"/);
  assert.match(phoneTicketSource, /\["Reserved Seats"/);
  assert.match(phoneTicketSource, /admissionSummary\.codeMessage/);
});

test("print ticket uses saved child assignments and preserves the existing scan token", () => {
  assert.match(
    reservedSeatSource,
    /buildReservationAdmissionSummary\(\s*seatingLink\.ticket_count,\s*confirmedChildSeatIds\.length/,
  );
  assert.match(reservedSeatSource, />Paid Admissions<\/p>/);
  assert.match(reservedSeatSource, /Free Children \(10 &amp; Under\)/);
  assert.match(reservedSeatSource, />Total Guests<\/p>/);
  assert.match(reservedSeatSource, />Reserved Seats<\/p>/);
  assert.match(reservedSeatSource, /admissionSummary\.codeMessage/);
  assert.match(reservedSeatSource, /scanToken=\{seatingLink\.scan_token\}/);
  assert.match(
    reservedSeatSource,
    /admissionSummary\.hasFreeChildren \? undefined : seatingLink\.ticket_count/,
  );
});

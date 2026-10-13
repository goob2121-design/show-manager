import assert from "node:assert/strict";
import test from "node:test";

import { buildReservationAdmissionSummary } from "./reservation-admission-display.ts";

test("paid-only reservations remain child-neutral", () => {
  assert.deepEqual(buildReservationAdmissionSummary(2, 0), {
    paidAdmissions: 2,
    freeChildAdmissions: 0,
    totalGuests: 2,
    hasFreeChildren: false,
    codeMessage: "One code admits all 2 guests in this reservation.",
  });
});

test("paid reservations include actual saved free-child assignments", () => {
  assert.deepEqual(buildReservationAdmissionSummary(2, 1), {
    paidAdmissions: 2,
    freeChildAdmissions: 1,
    totalGuests: 3,
    hasFreeChildren: true,
    codeMessage: "One code admits all 3 guests in this reservation.",
  });
});

test("other ticket types stay child-neutral when no child seats are present", () => {
  const summary = buildReservationAdmissionSummary(4, 0);

  assert.equal(summary.paidAdmissions, 4);
  assert.equal(summary.totalGuests, 4);
  assert.equal(summary.hasFreeChildren, false);
});

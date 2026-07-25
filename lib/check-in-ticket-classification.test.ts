import assert from "node:assert/strict";
import test from "node:test";
import {
  checkInAdmissionLabel,
  checkInTicketDestination,
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "./check-in-ticket-classification.ts";

test("paid reserved and general admission route to Prepaid / Online", () => {
  assert.equal(checkInTicketDestination("paid_online", "[Admission Type: reserved]"), "prepaid_online");
  assert.equal(checkInAdmissionLabel("paid_online", "[Admission Type: reserved]"), "Paid Reserved");
  assert.equal(checkInAdmissionLabel("paid_online", null), "Paid General Admission");
  assert.equal(checkInTicketDestination("manual", "Prepaid general admission"), "prepaid_online");
});

test("non-sponsor categories route to Special Admissions with visible labels", () => {
  const categories = [
    ["[Comp Type: guest]", "Guest Comp"],
    ["[Comp Type: band]", "Band Comp"],
    ["[Comp Type: media]", "Media / Press"],
    ["[Comp Type: volunteer]", "Volunteer"],
    ["[Comp Type: staff]", "Staff"],
    ["[Comp Type: other]", "Other"],
  ] as const;
  for (const [notes, label] of categories) {
    assert.equal(checkInTicketDestination("complimentary", notes), "special_admissions");
    assert.equal(checkInAdmissionLabel("complimentary", notes), label);
  }
});

test("Paid Door remains native", () => {
  assert.equal(checkInTicketDestination("door_paid", null), "paid_door");
  assert.equal(checkInAdmissionLabel("door_paid", null), "Paid Door");
});

import assert from "node:assert/strict";
import test from "node:test";
import type { AdmissionsPreviewDetail } from "./admissions-sync-preview.ts";
import {
  CHECK_IN_PREVIEW_READ_ONLY_MESSAGE,
  CHECK_IN_PREVIEW_READ_ONLY_TITLE,
  buildActionTotals,
  buildDestinationTotals,
  filterPreviewDetails,
  humanStatus,
  humanStatusLabel,
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "./admissions-sync-preview-presentation.ts";

function item(overrides: Partial<AdmissionsPreviewDetail>): AdmissionsPreviewDetail {
  return {
    sourceType: "reserved_link",
    maskedSourceIdentity: "reserved_link:abcd...wxyz",
    displayLabel: "Admission",
    quantity: 1,
    destinationGroup: "prepaid_online",
    classification: "paid_reserved_link_missing_projection",
    status: "would_add",
    reason: "Read-only preview reason.",
    ...overrides,
  };
}

test("Pamela-style paid reserved admission presents under Prepaid / Online", () => {
  const pamela = item({ displayLabel: "Pamela Blevins", quantity: 2 });
  assert.deepEqual(filterPreviewDetails([pamela], "prepaid_online"), [pamela]);
  assert.equal(humanStatusLabel(humanStatus(pamela)), "Ready to Add");
});

test("band and guest comps present under Special Admissions", () => {
  const band = item({ displayLabel: "Band Comp - Stuart Wyrick", destinationGroup: "special_admissions", classification: "band_comp" });
  const guest = item({ displayLabel: "Guest Comp - John Smith", destinationGroup: "special_admissions", classification: "guest_comp" });
  assert.deepEqual(filterPreviewDetails([band, guest], "special_admissions"), [band, guest]);
});

test("sponsor and paid-door records are already handled natively", () => {
  const sponsor = item({ destinationGroup: "sponsor_native", classification: "sponsor_admission_native_check_in", status: "already_present" });
  const paidDoor = item({ destinationGroup: "door_sale_native", classification: "already_present_in_check_in", status: "already_present" });
  assert.equal(humanStatusLabel(humanStatus(sponsor)), "Already Handled");
  assert.equal(humanStatusLabel(humanStatus(paidDoor)), "Already Handled");
});

test("needs-review records are not guessed into another filter", () => {
  const review = item({ destinationGroup: "needs_review", status: "skipped", classification: "ambiguous_source_ownership" });
  assert.deepEqual(filterPreviewDetails([review], "needs_review"), [review]);
  assert.deepEqual(filterPreviewDetails([review], "prepaid_online"), []);
  assert.deepEqual(filterPreviewDetails([review], "special_admissions"), []);
});

test("destination totals use quantity while action totals use source actions", () => {
  const details = [
    item({ quantity: 2 }),
    item({ destinationGroup: "special_admissions", classification: "band_comp", quantity: 1 }),
    item({ destinationGroup: "sponsor_native", classification: "sponsor_admission_native_check_in", status: "already_present", quantity: 4 }),
  ];
  assert.deepEqual(buildDestinationTotals(details), {
    prepaidOnline: 2,
    specialAdmissions: 1,
    sponsorNative: 4,
    paidDoorNative: 0,
    needsReview: 0,
  });
  assert.deepEqual(buildActionTotals(details), {
    readyToAdd: 2,
    alreadyPresent: 0,
    alreadyHandled: 1,
    needsReview: 0,
    errors: 0,
  });
});

test("read-only safety banner copy is present", () => {
  assert.equal(CHECK_IN_PREVIEW_READ_ONLY_TITLE, "READ-ONLY PREVIEW");
  assert.equal(CHECK_IN_PREVIEW_READ_ONLY_MESSAGE, "Nothing on this screen will be changed.");
});

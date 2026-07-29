import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyReservedScanAdmission,
  deriveScannedDoorModeQuantities,
  formatDoorScanSeatLabels,
  normalizeScannedReservationToken,
} from "./door-mode-scan";

test("normalizeScannedReservationToken trims scanner suffixes and validates prefix", () => {
  assert.equal(normalizeScannedReservationToken("  stf_ABC123\r\n"), "stf_ABC123");
  assert.equal(normalizeScannedReservationToken(""), null);
  assert.equal(normalizeScannedReservationToken("http://example.com"), null);
  assert.equal(normalizeScannedReservationToken(`stf_${"A".repeat(200)}`), null);
});

test("scan admission classification prefers the existing check-in ticket when available", () => {
  assert.deepEqual(
    classifyReservedScanAdmission(
      { is_complimentary: false, seat_category: "paid_reserved" },
      { ticket_type: "paid_online", notes: "[Admission Type: reserved]" },
    ),
    { admissionLabel: "Paid Reserved", reservationCategory: "paid_reserved" },
  );
});

test("scan seat labels are formatted in canonical order", () => {
  assert.deepEqual(formatDoorScanSeatLabels(["R-A2", "L-A1"]), ["L-A1", "R-A2"]);
});

test("deriveScannedDoorModeQuantities marks quantity 2 reservations as multi-ticket", () => {
  assert.deepEqual(
    deriveScannedDoorModeQuantities({ reservationTicketCount: 2, checkedInCount: 0 }),
    {
      totalEligibleTickets: 2,
      checkedInCount: 0,
      remainingTickets: 2,
      isMultiTicket: true,
      isFullyCheckedIn: false,
    },
  );
});

test("deriveScannedDoorModeQuantities keeps Check In All available for partial reservations", () => {
  assert.deepEqual(
    deriveScannedDoorModeQuantities({ reservationTicketCount: 4, checkedInCount: 1 }),
    {
      totalEligibleTickets: 4,
      checkedInCount: 1,
      remainingTickets: 3,
      isMultiTicket: true,
      isFullyCheckedIn: false,
    },
  );
});

test("deriveScannedDoorModeQuantities disables all-remaining actions once fully checked in", () => {
  assert.deepEqual(
    deriveScannedDoorModeQuantities({ reservationTicketCount: 4, checkedInCount: 4 }),
    {
      totalEligibleTickets: 4,
      checkedInCount: 4,
      remainingTickets: 0,
      isMultiTicket: true,
      isFullyCheckedIn: true,
    },
  );
});

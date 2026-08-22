import assert from "node:assert/strict";
import test from "node:test";
import { RESERVED_SEAT_DEFINITIONS } from "./reserved-seating";
import { buildReservedSeatMapRosterReport } from "./reserved-seat-map-roster";

const links = [
  { id: "link-one", customer_name: "Whitney Smith", ticket_count: 3 },
  { id: "link-two", customer_name: "Jane Doe", ticket_count: 2 },
];

const assignments = [
  { id: "a3", seating_link_id: "link-one", customer_name: "Whitney Smith", seat_id: "R-C7", section: "R", row_label: "C", seat_number: 7, assignment_type: "customer" },
  { id: "a1", seating_link_id: "link-one", customer_name: "Whitney Smith", seat_id: "L-B4", section: "L", row_label: "B", seat_number: 4, assignment_type: "customer" },
  { id: "a2", seating_link_id: "link-one", customer_name: "Whitney Smith", seat_id: "L-B3", section: "L", row_label: "B", seat_number: 3, assignment_type: "customer" },
  { id: "blocked", seating_link_id: null, customer_name: null, seat_id: "L-A1", section: "L", row_label: "A", seat_number: 1, assignment_type: "blocked" },
];

test("report uses every authoritative seat definition and identifies occupancy", () => {
  const report = buildReservedSeatMapRosterReport(assignments, links);
  assert.equal(report.seats.length, RESERVED_SEAT_DEFINITIONS.length);
  assert.equal(report.seats.find((seat) => seat.seatId === "L-B3")?.status, "assigned");
  assert.equal(report.seats.find((seat) => seat.seatId === "L-A2")?.status, "available");
  assert.equal(report.seats.find((seat) => seat.seatId === "L-A1")?.status, "unavailable");
  assert.equal(report.seats.find((seat) => seat.seatId === "L-B3")?.customerName, "Whitney Smith");
});

test("roster preserves physical card order and lists every customer seat", () => {
  const report = buildReservedSeatMapRosterReport(assignments, links);
  assert.deepEqual(report.roster, [
    { seatId: "L-B3", customerName: "Whitney Smith" },
    { seatId: "L-B4", customerName: "Whitney Smith" },
    { seatId: "R-C7", customerName: "Whitney Smith" },
  ]);
});

test("R-J9 and R-J10 remain assigned when those existing assignments are supplied", () => {
  const report = buildReservedSeatMapRosterReport([
    { id: "rj9", seating_link_id: "bryan", customer_name: "Bryan", seat_id: "R-J9", section: "R", row_label: "J", seat_number: 9, assignment_type: "customer" },
    { id: "rj10", seating_link_id: "bryan", customer_name: "Bryan", seat_id: "R-J10", section: "R", row_label: "J", seat_number: 10, assignment_type: "customer" },
  ], [{ id: "bryan", customer_name: "Bryan", ticket_count: 2 }]);

  assert.equal(report.seats.find((seat) => seat.seatId === "R-J9")?.status, "assigned");
  assert.equal(report.seats.find((seat) => seat.seatId === "R-J10")?.status, "assigned");
  assert.deepEqual(report.roster, [
    { seatId: "R-J9", customerName: "Bryan" },
    { seatId: "R-J10", customerName: "Bryan" },
  ]);
});

test("NSS uses existing missing-card calculation without occupying real seats", () => {
  const report = buildReservedSeatMapRosterReport(assignments, links);
  assert.deepEqual(report.nss, [{ seatingLinkId: "link-two", customerName: "Jane Doe", seatsNeeded: 2 }]);
  assert.equal(report.seats.some((seat) => seat.seatId === "NSS"), false);
  assert.deepEqual(report.summary, {
    assigned: 3,
    unavailable: 1,
    available: RESERVED_SEAT_DEFINITIONS.length - 4,
    nssNeeded: 2,
  });
});

test("report construction does not mutate assignments or reservations", () => {
  const assignmentsBefore = structuredClone(assignments);
  const linksBefore = structuredClone(links);
  buildReservedSeatMapRosterReport(assignments, links);
  assert.deepEqual(assignments, assignmentsBefore);
  assert.deepEqual(links, linksBefore);
});

import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const seatMapSource = readFileSync("app/components/reserved-seat-map.tsx", "utf8");
const customerPageSource = readFileSync("app/components/reserved-seat-selection-page.tsx", "utf8");
const customerRouteSource = readFileSync("app/reserved-seating/[token]/page.tsx", "utf8");
const publicAvailabilitySource = readFileSync("app/available-seats/shared.tsx", "utf8");
const adminSource = readFileSync("app/components/reserved-seating-panel.tsx", "utf8");

test("public seat maps default to occupant-name privacy and expose status labels", () => {
  assert.match(seatMapSource, /showCustomerSeatDetails = false/);
  assert.match(seatMapSource, /title: `\$\{seatLabel\} — \$\{titleStatus\}`/);
  assert.match(seatMapSource, /ariaLabel: `Seat \$\{seatLabel\}, \$\{publicStatus\}`/);
  assert.match(seatMapSource, /showCustomerSeatDetails && seatState\?\.customerName/);
});

test("customer seat selection neither queries nor passes other occupants' names", () => {
  assert.match(customerRouteSource, /\.select\("seat_id, seating_link_id, assignment_type"\)/);
  assert.doesNotMatch(customerRouteSource, /show_reserved_seat_assignments"\)[\s\S]*?\.select\("\*"\)/);
  assert.doesNotMatch(customerPageSource, /customerName:\s*assignment\?\.customer_name/);
  assert.match(customerPageSource, /showCustomerSeatDetails=\{false\}/);
});

test("public availability stays private while admin retains occupant names", () => {
  assert.match(publicAvailabilitySource, /\.select\("seat_id, assignment_type"\)/);
  assert.match(publicAvailabilitySource, /showCustomerSeatDetails=\{false\}/);
  assert.match(adminSource, /customerName:\s*assignment\?\.customer_name/);
  assert.match(adminSource, /showCustomerSeatDetails/);
});

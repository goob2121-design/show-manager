import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildDoorModeSeatAssignments,
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "./door-mode-seat-assignments.ts";

const lookupPath = new URL("./door-mode-seat-assignments.ts", import.meta.url);
const routePath = new URL("../app/api/admin/shows/[showId]/door-seat-assignments/route.ts", import.meta.url);
const canonicalSeatIds = ["L-C4", "R-A1", "R-A2", "R-J10"];

test("fresh direct Square ticket resolves through reserved link source_ticket_id", () => {
  const result = buildDoorModeSeatAssignments(
    [],
    [{ id: "direct-link", source_ticket_id: "square-ticket" }],
    [{ seating_link_id: "direct-link", seat_id: "R-J10" }],
    canonicalSeatIds,
  );
  assert.deepEqual(result, [{ projectedTicketId: "square-ticket", seatIds: ["R-J10"] }]);
});

test("Pamela-style projected ticket resolves through the projection ledger", () => {
  const result = buildDoorModeSeatAssignments(
    [{ source_id: "projected-link", projected_ticket_id: "projected-ticket" }],
    [],
    [
      { seating_link_id: "projected-link", seat_id: "R-A2" },
      { seating_link_id: "projected-link", seat_id: "R-A1" },
    ],
    canonicalSeatIds,
  );
  assert.deepEqual(result, [{ projectedTicketId: "projected-ticket", seatIds: ["R-A1", "R-A2"] }]);
});

test("both ownership paths deduplicate seats and invalid IDs are excluded", () => {
  const result = buildDoorModeSeatAssignments(
    [{ source_id: "shared-link", projected_ticket_id: "same-ticket" }],
    [{ id: "shared-link", source_ticket_id: "same-ticket" }],
    [
      { seating_link_id: "shared-link", seat_id: "L-C4" },
      { seating_link_id: "shared-link", seat_id: "L-C4" },
      { seating_link_id: "shared-link", seat_id: "INVALID" },
    ],
    canonicalSeatIds,
  );
  assert.deepEqual(result, [{ projectedTicketId: "same-ticket", seatIds: ["L-C4"] }]);
  assert.deepEqual(Object.keys(result[0]).sort(), ["projectedTicketId", "seatIds"]);
});

test("general admission without reserved ownership returns no seats", () => {
  assert.deepEqual(buildDoorModeSeatAssignments([], [], [], canonicalSeatIds), []);
});

test("seat lookup and route are authenticated, private, and SELECT-only", async () => {
  const lookupSource = await readFile(lookupPath, "utf8");
  const routeSource = await readFile(routePath, "utf8");
  assert.match(lookupSource, /from\("show_admission_projection_sources"\)/);
  assert.match(lookupSource, /select\("source_id, projected_ticket_id"\)/);
  assert.match(lookupSource, /from\("show_reserved_seating_links"\)/);
  assert.match(lookupSource, /select\("id, source_ticket_id"\)/);
  assert.match(lookupSource, /from\("show_reserved_seat_assignments"\)/);
  assert.match(lookupSource, /select\("seating_link_id, seat_id"\)/);
  assert.doesNotMatch(lookupSource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  assert.match(routeSource, /verifyAdminSessionCookieValue/);
  assert.match(routeSource, /export async function GET/);
  assert.doesNotMatch(routeSource, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(lookupSource, /guest_name|customer_name|email|payment|order_id|seat_selection_token/i);
  assert.doesNotMatch(routeSource, /guest_name|customer_name|email|payment|order_id|seat_selection_token/i);
});
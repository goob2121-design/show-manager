import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildDoorModeSeatAssignments,
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "./door-mode-seat-assignments.ts";

const lookupPath = new URL("./door-mode-seat-assignments.ts", import.meta.url);
const routePath = new URL("../app/api/admin/shows/[showId]/door-seat-assignments/route.ts", import.meta.url);

test("seat lookup returns only projected ticket IDs with canonical assignment seat IDs", () => {
  const result = buildDoorModeSeatAssignments(
    [{ source_id: "reserved-link-1", projected_ticket_id: "ticket-1" }],
    [
      { seating_link_id: "reserved-link-1", seat_id: "R-A1" },
      { seating_link_id: "reserved-link-1", seat_id: "R-A2" },
      { seating_link_id: "another-link", seat_id: "L-C4" },
    ],
  );
  assert.deepEqual(result, [{ projectedTicketId: "ticket-1", seatIds: ["R-A1", "R-A2"] }]);
  assert.deepEqual(Object.keys(result[0]).sort(), ["projectedTicketId", "seatIds"]);
});

test("seat lookup and route are authenticated and SELECT-only", async () => {
  const lookupSource = await readFile(lookupPath, "utf8");
  const routeSource = await readFile(routePath, "utf8");
  assert.match(lookupSource, /from\("show_admission_projection_sources"\)/);
  assert.match(lookupSource, /select\("source_id, projected_ticket_id"\)/);
  assert.match(lookupSource, /from\("show_reserved_seat_assignments"\)/);
  assert.match(lookupSource, /select\("seating_link_id, seat_id"\)/);
  assert.doesNotMatch(lookupSource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  assert.match(routeSource, /verifyAdminSessionCookieValue/);
  assert.match(routeSource, /export async function GET/);
  assert.doesNotMatch(routeSource, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(lookupSource, /guest_name|customer_name|email|payment|order_id|seat_selection_token/i);
  assert.doesNotMatch(routeSource, /guest_name|customer_name|email|payment|order_id|seat_selection_token/i);
});
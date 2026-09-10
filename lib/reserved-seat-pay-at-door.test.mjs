import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260910_add_reserved_seat_pay_at_door.sql", "utf8");
const route = readFileSync("app/api/admin/shows/[showId]/pay-at-door/route.ts", "utf8");
const scanRoute = readFileSync("app/api/admin/shows/[showId]/door-scan-lookup/route.ts", "utf8");
const door = readFileSync("app/components/door-mode-page.tsx", "utf8");
const admin = readFileSync("app/components/show-page.tsx", "utf8");
const reservedAdmin = readFileSync("app/components/reserved-seating-panel.tsx", "utf8");
const statusRoute = readFileSync("app/api/admin/shows/[showId]/pay-at-door-status/route.ts", "utf8");

test("only regular paid reserved creation exposes Pay at Door intent", () => {
  assert.match(reservedAdmin, /!formState\.isComplimentary && formState\.seatCategory === "paid_reserved"/);
  assert.match(reservedAdmin, /pay_at_door_intent: !formState\.isComplimentary/);
  assert.match(reservedAdmin, /Pay at Door · \$10 due/);
  assert.doesNotMatch(admin, /name="payAtDoor"|compTicketFormState\.payAtDoor|editingCompTicketFormState\.payAtDoor/);
});

test("projection transfers transitional intent to exactly one canonical admission", () => {
  assert.match(migration, /add column if not exists pay_at_door_intent/);
  assert.match(migration, /after insert on public\.show_admission_projection_sources/);
  assert.match(migration, /new\.source_type = 'reserved_link'/);
  assert.match(migration, /new\.source_id, new\.projected_ticket_id/);
  assert.match(migration, /ticket\.id = p_ticket_id/);
  assert.match(migration, /ticket\.show_id = link\.show_id/);
  assert.match(migration, /pay_at_door_amount = coalesce\(ticket\.pay_at_door_amount, 10\.00\)/);
  assert.doesNotMatch(migration, /set[\s\S]{0,250}pay_at_door_paid_at\s*=\s*null/);
});

test("reserved admin resolves direct or projected canonical payment status", () => {
  assert.match(reservedAdmin, /pay-at-door-status/);
  assert.match(statusRoute, /show_admission_projection_sources/);
  assert.match(statusRoute, /projected_ticket_id/);
  assert.match(statusRoute, /link\.source_ticket_id/);
  assert.match(reservedAdmin, /Pay at Door · \$10 due/);
  assert.match(reservedAdmin, /Paid at Door · \$\{payAtDoor\.method === "cash" \? "Cash" : "Card"\}/);
});

test("scan returns payment state and unpaid scans cannot auto-check in", () => {
  assert.match(scanRoute, /pay_at_door, pay_at_door_amount, pay_at_door_paid_at/);
  assert.match(door, /Payment Due —/);
  assert.match(door, /!\(autoTicket\.pay_at_door && !autoTicket\.pay_at_door_paid_at\)/);
  assert.match(door, /scannedTicket && !\(scannedTicket\.pay_at_door && !scannedTicket\.pay_at_door_paid_at\)/);
});

test("one locked RPC atomically records finance, payment, and check-in", () => {
  assert.match(migration, /for update/);
  assert.match(migration, /if v_ticket\.pay_at_door_paid_at is not null/);
  assert.match(migration, /insert into public\.show_finance_items/);
  assert.match(migration, /update public\.show_comp_tickets/);
  assert.match(migration, /checked_in_count = ticket\.ticket_count/);
  assert.match(migration, /pay_at_door_finance_item_id = v_finance_id/);
});

test("API returns the authoritative atomic result shape", () => {
  assert.match(route, /complete_reserved_seat_pay_at_door/);
  assert.match(route, /resultStatus: row\.result_status/);
  assert.match(route, /paymentMethod: row\.payment_method/);
  assert.match(route, /checkedInCount: row\.checked_in_count/);
  assert.match(door, /resultStatus !== "PAID_AND_CHECKED_IN"/);
});

test("cash opens the existing drawer only after success; card remains external", () => {
  assert.match(door, /payload\.result\?\.resultStatus !== "PAID_AND_CHECKED_IN"/);
  assert.match(door, /if \(method === "cash"\)/);
  assert.match(door, /openCashDrawerAfterPaidSale\(\)/);
  assert.match(door, /handlePayAtDoor\("external_card"\)/);
  assert.doesNotMatch(route, /square/i);
  assert.doesNotMatch(migration, /square/i);
});

test("Cancel is local-only and admission undo cannot clear payment", () => {
  assert.match(door, /onClick=\{\(\) => resetScanState\(\)\}/);
  assert.match(door, /\? "Cancel" : "Dismiss"/);
  assert.doesNotMatch(door, /pay_at_door_paid_at: null/);
  assert.doesNotMatch(door, /pay_at_door_finance_item_id: null/);
  assert.match(door, /update\(\{ checked_in: false, checked_in_count: 0 \}\)/);
});

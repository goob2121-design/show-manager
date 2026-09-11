import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const {
  calculateReservedSeatPayAtDoorAmount,
  formatReservedSeatPayAtDoorAmount,
} = await import("./reserved-seat-pay-at-door.ts");

test("Pay at Door amount is ten dollars per reserved seat", () => {
  assert.equal(calculateReservedSeatPayAtDoorAmount(1), 10);
  assert.equal(calculateReservedSeatPayAtDoorAmount(2), 20);
  assert.equal(calculateReservedSeatPayAtDoorAmount(3), 30);
  assert.equal(formatReservedSeatPayAtDoorAmount(2), "$20");
});

test("new reservations store the quantity-based amount without rewriting existing amounts", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260910_fix_reserved_seat_pay_at_door_quantity.sql", import.meta.url), "utf8");

  assert.match(migration, /pay_at_door_amount = coalesce\(ticket\.pay_at_door_amount, ticket\.ticket_count \* 10\.00\)/);
  assert.doesNotMatch(migration, /update public\.show_comp_tickets[\s\S]*where[\s\S]*pay_at_door = true;/i);
});

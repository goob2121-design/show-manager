import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateFinanceItems,
  derivePersonnelFinanceItems,
  hasPossibleManualPersonnelOverlap,
  normalizePersonnelPayout,
  personnelPayTotals,
} from "./show-personnel.ts";

function payout(overrides = {}) {
  return normalizePersonnelPayout({
    id: "pay-1", show_id: "show-1", payee_name: "Stuart Wyrick", category: "Band",
    description: null, amount: 150, paid: false, payment_method: null,
    entry_kind: "personnel", personnel_profile_id: "profile-1", guest_profile_id: null,
    role_snapshot: "Banjo and Vocals", paid_at: null, payment_note: null,
    display_order: 1, created_at: "2026-09-05T00:00:00Z", updated_at: "2026-09-05T00:00:00Z",
    ...overrides,
  });
}

const manual = {
  id: "manual-1", show_id: "show-1", type: "expense", category: "Advertising",
  label: "Facebook ad", amount: 100, notes: null, created_at: "2026-09-05T00:00:00Z",
};

test("personnel produces one stable read-only derived Finance expense", () => {
  const [derived] = derivePersonnelFinanceItems([payout()]);
  assert.equal(derived.id, "personnel:pay-1");
  assert.equal(derived.amount, 150);
  assert.equal(derived.type, "expense");
  assert.equal(derived.source, "personnel");
  assert.equal(derived.is_system_managed, true);
  assert.match(derived.label, /Stuart Wyrick/);
});

test("editing pay replaces the derived amount and paid state never changes expense", () => {
  assert.equal(derivePersonnelFinanceItems([payout({ amount: 175 })])[0].amount, 175);
  assert.equal(derivePersonnelFinanceItems([payout({ paid: true, paid_at: "2026-09-05T01:00:00Z" })])[0].amount, 150);
  assert.equal(derivePersonnelFinanceItems([]).length, 0);
});

test("aggregation preserves manual and Square rows without duplicating personnel", () => {
  const square = { ...manual, id: "square-1", source: "square", is_system_managed: true };
  const result = aggregateFinanceItems([manual, square], [payout()]);
  assert.deepEqual(result.map((item) => item.id), ["manual-1", "square-1", "personnel:pay-1"]);
  assert.equal(result.reduce((sum, item) => sum + item.amount, 0), 350);
});

test("personnel totals derive total, paid, and remaining", () => {
  assert.deepEqual(personnelPayTotals([payout(), payout({ id: "pay-2", amount: 75, paid: true })]), {
    total: 225, paid: 75, remaining: 150,
  });
});

test("manual overlap warning is non-mutating and ignores system-managed rows", () => {
  const overlapping = { ...manual, category: "House Band Pay" };
  assert.equal(hasPossibleManualPersonnelOverlap([overlapping]), true);
  assert.equal(hasPossibleManualPersonnelOverlap([{ ...overlapping, source: "square" }]), false);
  assert.equal(overlapping.category, "House Band Pay");
});


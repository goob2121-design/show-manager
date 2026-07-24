import assert from "node:assert/strict";
import test from "node:test";
import {
  getGroupedPurchaserName,
  type SquareImportEventRow,
} from "./recent-square-webhook-results";

function event(id: string, result: string, purchaserName?: string): SquareImportEventRow {
  return {
    id,
    event_id: `event_${id}`,
    event_type: "payment.updated",
    payment_id: "payment_1",
    order_id: "order_1",
    line_item_uid: "line_1",
    catalog_variation_id: "variation_1",
    show_id: "show_1",
    show_name: "The Cumberland Mountain Music Show",
    result,
    ticket_count: 2,
    email_present: true,
    seat_link_created: true,
    email_sent: true,
    error_message: null,
    payload_summary: purchaserName ? { purchaserName, nameFound: true } : { nameFound: false },
    received_at: "2026-07-23T12:00:00.000Z",
    imported_at: "2026-07-23T12:00:00.000Z",
  };
}

test("uses purchaser name from the imported primary row", () => {
  const imported = event("imported", "imported", "Bryan Turner");
  const duplicate = event("duplicate", "duplicate", "Other Name");

  assert.equal(getGroupedPurchaserName(imported, [imported, duplicate]), "Bryan Turner");
});

test("uses purchaser name from another grouped row when primary lacks it", () => {
  const imported = event("imported", "imported");
  const duplicate = event("duplicate", "duplicate", "Bryan Turner");

  assert.equal(getGroupedPurchaserName(imported, [imported, duplicate]), "Bryan Turner");
});

test("uses Unavailable only when no grouped row contains a purchaser name", () => {
  const imported = event("imported", "imported");
  const duplicate = event("duplicate", "duplicate");

  assert.equal(getGroupedPurchaserName(imported, [imported, duplicate]), "Unavailable");
});

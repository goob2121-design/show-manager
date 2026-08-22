import assert from "node:assert/strict";
import test from "node:test";
import { isTicketSaleStatus, normalizeTicketSaleStatus, ticketSaleStatusLabel } from "./ticket-sale-status.ts";

test("ticket sale states are constrained and legacy/null values safely resolve to public", () => {
  assert.equal(isTicketSaleStatus("not_on_sale"), true);
  assert.equal(isTicketSaleStatus("presale"), true);
  assert.equal(isTicketSaleStatus("public"), true);
  assert.equal(isTicketSaleStatus("private"), false);
  assert.equal(normalizeTicketSaleStatus(null), "public");
});

test("ticket sale state labels are explicit", () => {
  assert.equal(ticketSaleStatusLabel("not_on_sale"), "NOT ON SALE");
  assert.equal(ticketSaleStatusLabel("presale"), "PRESALE / EARLY ACCESS");
  assert.equal(ticketSaleStatusLabel("public"), "PUBLIC SALE");
});

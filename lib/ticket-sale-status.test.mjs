import assert from "node:assert/strict";
import test from "node:test";
import { effectiveTicketSaleStatus, getEffectiveTicketSaleState, isTicketSaleStatus, normalizeTicketSaleStatus, ticketSaleStatusLabel } from "./ticket-sale-status.ts";

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

test("effective status follows exact presale and public timestamp boundaries", () => {
  const schedule = {
    ticket_sale_status: "presale",
    presale_starts_at: "2026-09-01T20:00:00-04:00",
    public_sale_starts_at: "2026-09-08T20:00:00-04:00",
  };
  assert.equal(effectiveTicketSaleStatus(schedule, new Date("2026-09-01T23:59:59.999Z")), "not_on_sale");
  assert.equal(effectiveTicketSaleStatus(schedule, new Date("2026-09-02T00:00:00.000Z")), "presale");
  assert.equal(effectiveTicketSaleStatus(schedule, new Date("2026-09-05T12:00:00.000Z")), "presale");
  assert.equal(effectiveTicketSaleStatus(schedule, new Date("2026-09-09T00:00:00.000Z")), "public");
  assert.equal(effectiveTicketSaleStatus(schedule, new Date("2026-09-10T12:00:00.000Z")), "public");
});

test("manual Not On Sale override wins over active scheduled windows", () => {
  const state = getEffectiveTicketSaleState({
    ticket_sale_status: "not_on_sale",
    presale_starts_at: "2026-09-01T00:00:00Z",
    public_sale_starts_at: "2026-09-08T00:00:00Z",
  }, new Date("2026-09-05T00:00:00Z"));
  assert.equal(state.status, "not_on_sale");
  assert.equal(state.manualOverride, true);
});

test("incomplete schedules use safe documented transitions", () => {
  const publicOnly = { ticket_sale_status: "public", presale_starts_at: null, public_sale_starts_at: "2026-09-08T00:00:00Z" };
  assert.equal(effectiveTicketSaleStatus(publicOnly, new Date("2026-09-07T23:59:59Z")), "not_on_sale");
  assert.equal(effectiveTicketSaleStatus(publicOnly, new Date("2026-09-08T00:00:00Z")), "public");
  const presaleOnly = { ticket_sale_status: "public", presale_starts_at: "2026-09-01T00:00:00Z", public_sale_starts_at: null };
  assert.equal(effectiveTicketSaleStatus(presaleOnly, new Date("2026-09-01T00:00:00Z")), "presale");
  assert.equal(effectiveTicketSaleStatus(presaleOnly, new Date("2027-01-01T00:00:00Z")), "presale");
  assert.equal(effectiveTicketSaleStatus({ ticket_sale_status: "public", presale_starts_at: null, public_sale_starts_at: null }), "public");
});

test("invalid schedules are flagged and fail closed", () => {
  const state = getEffectiveTicketSaleState({
    ticket_sale_status: "presale",
    presale_starts_at: "2026-09-08T00:00:00Z",
    public_sale_starts_at: "2026-09-01T00:00:00Z",
  });
  assert.equal(state.status, "not_on_sale");
  assert.equal(state.configurationError, "Public sale start cannot be before presale start.");
});

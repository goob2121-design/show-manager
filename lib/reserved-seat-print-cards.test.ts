import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReservedSeatPrintCards,
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "./reserved-seat-print-cards.ts";

const link = (ticketCount: number) => ({ id: "link-1", customer_name: "John Smith", ticket_count: ticketCount });
const assignment = (seatId: string, linkId: string | null = "link-1") => ({
  id: `assignment-${seatId}`,
  seating_link_id: linkId,
  customer_name: "John Smith",
  seat_id: seatId,
  section: "L",
  row_label: "B",
  seat_number: Number(seatId.replace(/\D/g, "")),
  assignment_type: "customer",
});

test("two assigned reserved seats produce no NSS cards", () => {
  const cards = buildReservedSeatPrintCards([assignment("L-B2"), assignment("L-B3")], [link(2)]);
  assert.deepEqual(cards.map((card) => card.seatId), ["L-B2", "L-B3"]);
});

test("two unassigned reserved seats produce two print-only NSS cards", () => {
  const cards = buildReservedSeatPrintCards([], [link(2)]);
  assert.deepEqual(cards.map((card) => card.seatId), ["NSS", "NSS"]);
  assert.ok(cards.every((card) => card.kind === "nss" && card.seatExplanation === "NO SEAT SELECTED"));
});

test("a partially assigned reservation prints actual seats plus only the missing NSS quantity", () => {
  const cards = buildReservedSeatPrintCards([assignment("L-B2"), assignment("L-B3")], [link(3)]);
  assert.deepEqual(cards.map((card) => card.seatId), ["L-B2", "L-B3", "NSS"]);
});

test("records outside the reserved-link source do not generate NSS cards", () => {
  const cards = buildReservedSeatPrintCards([assignment("GA", null)], []);
  assert.equal(cards.some((card) => card.kind === "nss"), false);
});

test("NSS is only a presentation card and never an assignment-shaped value", () => {
  const [card] = buildReservedSeatPrintCards([], [link(1)]);
  assert.equal(card?.kind, "nss");
  assert.equal(card?.seatId, "NSS");
  assert.equal("assignment_type" in (card ?? {}), false);
  assert.equal("seating_link_id" in (card ?? {}), false);
});

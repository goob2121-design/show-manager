import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReservedSeatPrintCards,
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "./reserved-seat-print-cards.ts";

const link = (ticketCount: number) => ({ id: "link-1", customer_name: "John Smith", ticket_count: ticketCount });
const assignment = (
  seatId: string,
  linkId: string | null = "link-1",
  customerName = "John Smith",
) => {
  const match = /^(L|R)-([A-J])(\d+)$/.exec(seatId);
  return {
    id: `assignment-${seatId}`,
    seating_link_id: linkId,
    customer_name: customerName,
    seat_id: seatId,
    section: match?.[1] ?? "L",
    row_label: match?.[2] ?? "B",
    seat_number: Number(match?.[3] ?? seatId.replace(/\D/g, "")),
    assignment_type: "customer",
  };
};

test("assigned cards sort Left before Right, then by row and numeric seat number", () => {
  const rows = "ABCDEFGHIJ".split("");
  const seatNumbers = Array.from({ length: 10 }, (_, index) => index + 1);
  const expectedSeatIds = [
    ...rows.flatMap((row) => seatNumbers.map((seatNumber) => `L-${row}${seatNumber}`)),
    ...rows.flatMap((row) => seatNumbers.map((seatNumber) => `R-${row}${seatNumber}`)),
  ];
  const unsortedAssignments = [...expectedSeatIds]
    .reverse()
    .map((seatId) => assignment(seatId));

  const cards = buildReservedSeatPrintCards(unsortedAssignments, []);

  assert.deepEqual(cards.map((card) => card.seatId), expectedSeatIds);
  assert.ok(cards.indexOf(cards.find((card) => card.seatId === "L-A10")!) > cards.indexOf(cards.find((card) => card.seatId === "L-A9")!));
  assert.ok(cards.indexOf(cards.find((card) => card.seatId === "R-A1")!) > cards.indexOf(cards.find((card) => card.seatId === "L-J10")!));
});

test("NSS cards print after every assigned-seat card regardless of customer name", () => {
  const cards = buildReservedSeatPrintCards(
    [assignment("R-J10", "link-1", "Zelda Guest")],
    [
      { id: "link-1", customer_name: "Zelda Guest", ticket_count: 2 },
      { id: "link-2", customer_name: "Aaron Guest", ticket_count: 1 },
    ],
  );

  assert.deepEqual(cards.map((card) => card.seatId), ["R-J10", "NSS", "NSS"]);
  assert.equal(cards[0]?.kind, "assigned");
  assert.ok(cards.slice(1).every((card) => card.kind === "nss"));
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

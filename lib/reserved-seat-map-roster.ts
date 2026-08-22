import { RESERVED_SEAT_DEFINITIONS } from "@/lib/reserved-seating";
import {
  buildReservedSeatPrintCards,
  type ReservedSeatPrintAssignment,
  type ReservedSeatPrintLink,
} from "@/lib/reserved-seat-print-cards";

export type SeatMapRosterSeat = {
  seatId: string;
  section: string;
  rowLabel: string;
  seatNumber: number;
  status: "assigned" | "available" | "unavailable";
  customerName: string | null;
};

export type SeatMapRosterReport = {
  seats: SeatMapRosterSeat[];
  roster: Array<{ seatId: string; customerName: string }>;
  nss: Array<{ seatingLinkId: string; customerName: string; seatsNeeded: number }>;
  summary: { assigned: number; available: number; unavailable: number; nssNeeded: number };
};

export function buildReservedSeatMapRosterReport(
  assignments: readonly ReservedSeatPrintAssignment[],
  reservedLinks: readonly ReservedSeatPrintLink[],
): SeatMapRosterReport {
  const assignmentCopies = assignments.map((assignment) => ({ ...assignment }));
  const linkCopies = reservedLinks.map((link) => ({ ...link }));
  const cards = buildReservedSeatPrintCards(assignmentCopies, linkCopies);
  const assignedCards = cards.filter((card) => card.kind === "assigned");
  const assignedBySeatId = new Map(assignedCards.map((card) => [card.seatId, card]));
  const unavailableSeatIds = new Set(
    assignments
      .filter((assignment) => assignment.assignment_type === "blocked")
      .map((assignment) => assignment.seat_id),
  );

  const seats = RESERVED_SEAT_DEFINITIONS.map((definition): SeatMapRosterSeat => {
    const assigned = assignedBySeatId.get(definition.seatId);
    return {
      seatId: definition.seatId,
      section: definition.section,
      rowLabel: definition.rowLabel,
      seatNumber: definition.seatNumber,
      status: assigned ? "assigned" : unavailableSeatIds.has(definition.seatId) ? "unavailable" : "available",
      customerName: assigned?.customerName ?? null,
    };
  });

  const nss = reservedLinks.flatMap((link) => {
    const prefix = `nss-${link.id}-`;
    const seatsNeeded = cards.filter((card) => card.kind === "nss" && card.id.startsWith(prefix)).length;
    return seatsNeeded > 0
      ? [{ seatingLinkId: link.id, customerName: link.customer_name.trim() || "Reserved Guest", seatsNeeded }]
      : [];
  });

  const assigned = assignedCards.length;
  const unavailable = seats.filter((seat) => seat.status === "unavailable").length;
  return {
    seats,
    roster: assignedCards.map((card) => ({ seatId: card.seatId, customerName: card.customerName })),
    nss,
    summary: {
      assigned,
      unavailable,
      available: RESERVED_SEAT_DEFINITIONS.length - assigned - unavailable,
      nssNeeded: nss.reduce((total, entry) => total + entry.seatsNeeded, 0),
    },
  };
}

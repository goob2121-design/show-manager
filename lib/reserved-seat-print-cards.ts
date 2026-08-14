export type ReservedSeatPrintLink = {
  id: string;
  customer_name: string;
  ticket_count: number;
};

export type ReservedSeatPrintAssignment = {
  id: string;
  seating_link_id: string | null;
  customer_name: string | null;
  seat_id: string;
  section: string;
  row_label: string;
  seat_number: number;
  assignment_type: string;
};

export type ReservedSeatPrintCard =
  | {
      kind: "assigned";
      id: string;
      customerName: string;
      seatId: string;
      seatExplanation: string;
    }
  | {
      kind: "nss";
      id: string;
      customerName: string;
      seatId: "NSS";
      seatExplanation: "NO SEAT SELECTED";
    };

export function buildReservedSeatPrintCards(
  assignments: ReservedSeatPrintAssignment[],
  reservedLinks: ReservedSeatPrintLink[],
) {
  const assignedCountByLinkId = new Map<string, number>();
  const assignedCards = assignments
    .filter((assignment) => assignment.assignment_type === "customer")
    .map((assignment): ReservedSeatPrintCard => {
      if (assignment.seating_link_id) {
        assignedCountByLinkId.set(
          assignment.seating_link_id,
          (assignedCountByLinkId.get(assignment.seating_link_id) ?? 0) + 1,
        );
      }

      return {
        kind: "assigned",
        id: assignment.id,
        customerName: assignment.customer_name?.trim() || "Reserved Guest",
        seatId: assignment.seat_id,
        seatExplanation: `Section ${assignment.section} - Row ${assignment.row_label} - Seat ${assignment.seat_number}`,
      };
    });

  const nssCards = reservedLinks.flatMap((link): ReservedSeatPrintCard[] => {
    const customerName = link.customer_name.trim();
    const requiredSeatCount = Math.max(0, Math.floor(link.ticket_count) || 0);
    const assignedSeatCount = assignedCountByLinkId.get(link.id) ?? 0;
    const missingSeatCount = Math.max(requiredSeatCount - assignedSeatCount, 0);

    if (!customerName || missingSeatCount === 0) return [];

    return Array.from({ length: missingSeatCount }, (_, index) => ({
      kind: "nss",
      id: `nss-${link.id}-${index + 1}`,
      customerName,
      seatId: "NSS",
      seatExplanation: "NO SEAT SELECTED",
    }));
  });

  return [...assignedCards, ...nssCards].sort((left, right) => {
    const nameComparison = left.customerName.localeCompare(right.customerName, "en-US");
    if (nameComparison !== 0) return nameComparison;
    if (left.kind !== right.kind) return left.kind === "assigned" ? -1 : 1;
    return left.seatId.localeCompare(right.seatId, "en-US");
  });
}

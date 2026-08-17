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

function reservedSeatSectionRank(section: string) {
  const normalizedSection = section.trim().toLowerCase();
  if (normalizedSection === "l" || normalizedSection === "left") return 0;
  if (normalizedSection === "r" || normalizedSection === "right") return 1;
  return 2;
}

function comparePhysicalSeats(
  left: ReservedSeatPrintAssignment,
  right: ReservedSeatPrintAssignment,
) {
  const sectionComparison = reservedSeatSectionRank(left.section) - reservedSeatSectionRank(right.section);
  if (sectionComparison !== 0) return sectionComparison;

  const rowComparison = left.row_label.trim().localeCompare(right.row_label.trim(), "en-US", {
    sensitivity: "base",
    numeric: true,
  });
  if (rowComparison !== 0) return rowComparison;

  const seatNumberComparison = left.seat_number - right.seat_number;
  if (seatNumberComparison !== 0) return seatNumberComparison;

  return left.seat_id.localeCompare(right.seat_id, "en-US", { numeric: true });
}

export function buildReservedSeatPrintCards(
  assignments: ReservedSeatPrintAssignment[],
  reservedLinks: ReservedSeatPrintLink[],
) {
  const assignedCountByLinkId = new Map<string, number>();
  const assignedCards = assignments
    .filter((assignment) => assignment.assignment_type === "customer")
    .sort(comparePhysicalSeats)
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

  nssCards.sort((left, right) => {
    const nameComparison = left.customerName.localeCompare(right.customerName, "en-US");
    if (nameComparison !== 0) return nameComparison;
    return left.id.localeCompare(right.id, "en-US", { numeric: true });
  });

  return [...assignedCards, ...nssCards];
}

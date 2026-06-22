export const RESERVED_SEATING_SECTION_LABELS = ["L", "R"] as const;
export const RESERVED_SEATING_ROW_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;
export const RESERVED_SEATING_SEAT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type ReservedSeatingSection = (typeof RESERVED_SEATING_SECTION_LABELS)[number];
export type ReservedSeatingRowLabel = (typeof RESERVED_SEATING_ROW_LABELS)[number];
export type ReservedSeatAssignmentType = "customer" | "blocked";
export type ReservedSeatMapStatus = "available" | "assigned" | "unavailable" | "selected";

export type ReservedSeatDefinition = {
  seatId: string;
  section: ReservedSeatingSection;
  rowLabel: ReservedSeatingRowLabel;
  seatNumber: number;
};

export function buildReservedSeatId(section: ReservedSeatingSection, rowLabel: ReservedSeatingRowLabel, seatNumber: number) {
  return `${section}-${rowLabel}${seatNumber}`;
}

export function buildReservedSeatDefinitions() {
  return RESERVED_SEATING_ROW_LABELS.flatMap((rowLabel) =>
    RESERVED_SEATING_SECTION_LABELS.flatMap((section) =>
      RESERVED_SEATING_SEAT_NUMBERS.map((seatNumber) => ({
        seatId: buildReservedSeatId(section, rowLabel, seatNumber),
        section,
        rowLabel,
        seatNumber,
      })),
    ),
  );
}

export const RESERVED_SEAT_DEFINITIONS = buildReservedSeatDefinitions();

export function getReservedSeatDefinition(seatId: string) {
  return RESERVED_SEAT_DEFINITIONS.find((seat) => seat.seatId === seatId) ?? null;
}

export function sortReservedSeatIds(seatIds: string[]) {
  const positionBySeatId = new Map(RESERVED_SEAT_DEFINITIONS.map((seat, index) => [seat.seatId, index]));

  return [...seatIds].sort((left, right) => {
    const leftIndex = positionBySeatId.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = positionBySeatId.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

export function formatReservedSeatLabel(seatId: string) {
  const definition = getReservedSeatDefinition(seatId);
  if (!definition) {
    return seatId;
  }

  return `${definition.section}-${definition.rowLabel}${definition.seatNumber}`;
}

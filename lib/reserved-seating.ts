export const RESERVED_SEATING_VENUE = {
  venueName: "Cumberland Gap Convention Center",
  venueAddress: "601 Colwyn St, Cumberland Gap, TN 37724",
  venuePhotoPath: "/cumberland-gap-convention-center.jpg",
  venuePhotoFallbackPath: "/portal_bkg.png",
  stageLabel: "Stage",
  frontLabel: "Front Of Room",
  backLabel: "Back Of Room",
  aisleLabel: "Aisle",
  sections: ["L", "R"] as const,
  rows: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const,
  seatsPerRow: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const,
  aisleLabelRows: [0, 4, 7] as const,
} as const;

export const RESERVED_SEATING_SECTION_LABELS = RESERVED_SEATING_VENUE.sections;
export const RESERVED_SEATING_ROW_LABELS = RESERVED_SEATING_VENUE.rows;
export const RESERVED_SEATING_SEAT_NUMBERS = RESERVED_SEATING_VENUE.seatsPerRow;

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
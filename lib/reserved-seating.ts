import { RESERVED_SEATING_VENUE_CONFIG } from "@/app/lib/reserved-seating-venue-config";

export const RESERVED_SEATING_VENUE = RESERVED_SEATING_VENUE_CONFIG;
export const RESERVED_SEATING_SECTION_CONFIGS = RESERVED_SEATING_VENUE.sections;
export const RESERVED_SEATING_SECTION_LABELS = RESERVED_SEATING_SECTION_CONFIGS.map((section) => section.prefix);
export const RESERVED_SEATING_ROW_LABELS = [...RESERVED_SEATING_SECTION_CONFIGS[0].rows];
export const RESERVED_SEATING_SEAT_NUMBERS = Array.from(
  { length: RESERVED_SEATING_SECTION_CONFIGS[0].seatsPerRow },
  (_, index) => index + 1,
);

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
  return RESERVED_SEATING_SECTION_CONFIGS.flatMap((section) =>
    section.rows.flatMap((rowLabel) =>
      Array.from({ length: section.seatsPerRow }, (_, index) => index + 1).map((seatNumber) => ({
        seatId: buildReservedSeatId(section.prefix, rowLabel, seatNumber),
        section: section.prefix,
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
import type { ShowReservedSeatAssignment, ShowReservedSeatingLink } from "@/lib/types";

export const DEFAULT_FREE_CHILD_SEAT_LIMIT = 3;

export type ReservedFamilySeatSummary = {
  paidSeatIds: string[];
  childSeatIds: string[];
  paidSeatCount: number;
  childSeatCount: number;
  totalSeatCount: number;
};

export function isReservedChildSeatsEnabled() {
  return process.env.STAGEFLOW_ENABLE_CHILD_RESERVED_SEATS === "true";
}

export function isChildEligibleReservation(
  link: Pick<ShowReservedSeatingLink, "is_complimentary" | "seat_category" | "child_seat_limit">,
) {
  return !link.is_complimentary && link.seat_category === "paid_reserved" && link.child_seat_limit > 0;
}

export function summarizeReservedFamilySeats(
  assignments: Array<Pick<ShowReservedSeatAssignment, "seat_id" | "occupant_type">>,
): ReservedFamilySeatSummary {
  const paidSeatIds = assignments
    .filter((assignment) => assignment.occupant_type !== "child_free")
    .map((assignment) => assignment.seat_id);
  const childSeatIds = assignments
    .filter((assignment) => assignment.occupant_type === "child_free")
    .map((assignment) => assignment.seat_id);

  return {
    paidSeatIds,
    childSeatIds,
    paidSeatCount: paidSeatIds.length,
    childSeatCount: childSeatIds.length,
    totalSeatCount: paidSeatIds.length + childSeatIds.length,
  };
}

export function getReservedFamilySeatUpdateError(status: string, childSeatLimit: number) {
  switch (status) {
    case "UPDATED": return null;
    case "NOT_FOUND": return "This reservation link was not found.";
    case "NOT_ELIGIBLE": return "Free children's seats are available only for paid reserved admissions.";
    case "PAID_SEAT_COUNT_CHANGED": return "All existing paid seats must remain part of the reservation.";
    case "CHILD_SEAT_REMOVAL_NOT_ALLOWED": return "Previously reserved children's seats cannot be removed from this link.";
    case "CHILD_LIMIT_EXCEEDED": return childSeatLimit > DEFAULT_FREE_CHILD_SEAT_LIMIT
      ? `This reservation is approved for up to ${childSeatLimit} free children's seats.`
      : "Online reservations may add up to 3 free children's seats. Contact CMMS for larger families.";
    case "DUPLICATE_SEAT": return "Each member of the party must have a different seat.";
    case "INVALID_SEAT": return "One or more selected seats are invalid.";
    case "SEAT_CONFLICT": return "One or more selected seats are no longer available. Your original seats were not changed.";
    case "ALREADY_CHECKED_IN": return "Seats cannot be changed after any member of this reservation has checked in.";
    default: return "Unable to update this family's reserved seats.";
  }
}

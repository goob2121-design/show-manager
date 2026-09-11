export const RESERVED_SEAT_PAY_AT_DOOR_PRICE_PER_SEAT = 10;

export function normalizeReservedSeatPayAtDoorQuantity(value: string | number) {
  return Math.max(1, Number.parseInt(String(value).trim(), 10) || 1);
}

export function calculateReservedSeatPayAtDoorAmount(ticketCount: string | number) {
  return normalizeReservedSeatPayAtDoorQuantity(ticketCount) * RESERVED_SEAT_PAY_AT_DOOR_PRICE_PER_SEAT;
}

export function formatReservedSeatPayAtDoorAmount(ticketCount: string | number) {
  return `$${calculateReservedSeatPayAtDoorAmount(ticketCount).toFixed(0)}`;
}

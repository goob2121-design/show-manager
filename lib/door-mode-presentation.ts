export type DoorSearchableAdmission = {
  guest_name: string;
  ticket_type: string | null;
  notes: string | null;
};

export type RecentGuestCheckIn = {
  id: string;
  guestName: string;
  quantity: number;
  resultingTotal: number;
  ticketCount: number;
  createdAt: number;
};

export type DoorAttendanceAdmission = {
  ticket_count: number;
};

export function normalizedDoorSearch(value: string) {
  return value.trim().toLowerCase();
}

export function explicitSeatLabel(notes: string | null | undefined) {
  const match = notes?.match(/\[seats?:\s*([^\]]+)\]/i);
  return match?.[1]?.trim() || null;
}

export function admissionMatchesDoorSearch(
  admission: DoorSearchableAdmission,
  categoryLabel: string,
  query: string,
) {
  const normalizedQuery = normalizedDoorSearch(query);
  if (!normalizedQuery) return true;
  const seatLabel = explicitSeatLabel(admission.notes);
  return [admission.guest_name, categoryLabel, seatLabel]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(normalizedQuery));
}

export function addRecentGuestCheckIn(
  current: RecentGuestCheckIn[],
  action: RecentGuestCheckIn,
) {
  return [action, ...current].slice(0, 5);
}

export function expectedDoorAttendance(
  admissions: DoorAttendanceAdmission[],
  sponsorAllowance: number,
) {
  return admissions.reduce((sum, admission) => sum + admission.ticket_count, 0) + sponsorAllowance;
}

export function attendanceProgressPercent(attended: number, expected: number) {
  if (expected <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((attended / expected) * 100)));
}

export function isAdmissionFullyCheckedIn(checkedInCount: number, ticketCount: number) {
  return ticketCount > 0 && checkedInCount >= ticketCount;
}
export function normalizeDoorReservedSeatIds(
  seatIds: readonly string[],
  canonicalSeatIds: readonly string[],
) {
  const positionBySeatId = new Map(canonicalSeatIds.map((seatId, index) => [seatId, index]));
  if (seatIds.length === 0 || seatIds.some((seatId) => !positionBySeatId.has(seatId))) return [];

  return [...new Set(seatIds)].sort(
    (left, right) => positionBySeatId.get(left)! - positionBySeatId.get(right)!,
  );
}

export function parseDoorReservedSeatIds(
  notes: string | null | undefined,
  canonicalSeatIds: readonly string[],
) {
  const seatLabel = explicitSeatLabel(notes);
  if (!seatLabel) return [];
  return normalizeDoorReservedSeatIds(
    seatLabel.split(",").map((token) => token.trim()).filter(Boolean),
    canonicalSeatIds,
  );
}

export type ReservationAdmissionSummary = {
  paidAdmissions: number;
  freeChildAdmissions: number;
  totalGuests: number;
  hasFreeChildren: boolean;
  codeMessage: string;
};

function normalizeAdmissionCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function buildReservationAdmissionSummary(
  paidAdmissionCount: number,
  freeChildAdmissionCount: number,
): ReservationAdmissionSummary {
  const paidAdmissions = normalizeAdmissionCount(paidAdmissionCount);
  const freeChildAdmissions = normalizeAdmissionCount(freeChildAdmissionCount);
  const totalGuests = paidAdmissions + freeChildAdmissions;
  const guestLabel = totalGuests === 1 ? "1 guest" : `all ${totalGuests} guests`;

  return {
    paidAdmissions,
    freeChildAdmissions,
    totalGuests,
    hasFreeChildren: freeChildAdmissions > 0,
    codeMessage: `One code admits ${guestLabel} in this reservation.`,
  };
}

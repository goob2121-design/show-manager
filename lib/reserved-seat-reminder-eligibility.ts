export type ReservedSeatReminderEligibilityReason =
  | "eligible"
  | "complete"
  | "partial_assignment"
  | "general_admission"
  | "missing_email"
  | "invalid_token"
  | "completed_selection";

export type ReservedSeatReminderEligibility = {
  eligible: boolean;
  reason: ReservedSeatReminderEligibilityReason;
  requiredSeats: number;
  assignedSeats: number;
  remainingSeats: number;
};

function validEmail(value: string | null | undefined) {
  return Boolean(value?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}
export function isReservedSeatBulkOperationId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}


export function getReservedSeatReminderEligibility(input: {
  ticketCount: number;
  assignedCustomerSeatCount: number;
  email: string | null;
  selectionToken: string | null;
  submittedAt: string | null;
  isReservedSeating: boolean;
}): ReservedSeatReminderEligibility {
  const requiredSeats = Math.max(0, Math.floor(input.ticketCount) || 0);
  const assignedSeats = Math.max(0, Math.floor(input.assignedCustomerSeatCount) || 0);
  const remainingSeats = Math.max(0, requiredSeats - assignedSeats);
  const result = (eligible: boolean, reason: ReservedSeatReminderEligibilityReason) => ({
    eligible,
    reason,
    requiredSeats,
    assignedSeats,
    remainingSeats,
  });

  if (!input.isReservedSeating) return result(false, "general_admission");
  if (remainingSeats === 0) return result(false, "complete");
  if (assignedSeats > 0) return result(false, "partial_assignment");
  if (input.submittedAt) return result(false, "completed_selection");
  if (!validEmail(input.email)) return result(false, "missing_email");
  if (!input.selectionToken?.trim()) return result(false, "invalid_token");
  return result(true, "eligible");
}

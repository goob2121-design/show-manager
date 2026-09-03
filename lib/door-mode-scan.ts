import { checkInAdmissionLabel } from "@/lib/check-in-ticket-classification";
import { formatReservedSeatLabel, sortReservedSeatIds } from "@/lib/reserved-seating";
import type { ShowCompTicket, ShowReservedSeatingLink } from "@/lib/types";
import type { SponsorCompRedemptionResult } from "@/lib/sponsor-comp-redemption-tokens";

const MAX_SCANNED_TOKEN_LENGTH = 128;

export type DoorModeScanLookupTicket = Pick<
  ShowCompTicket,
  | "id"
  | "show_id"
  | "guest_name"
  | "ticket_count"
  | "ticket_type"
  | "notes"
  | "checked_in"
  | "checked_in_count"
  | "created_at"
>;

export type DoorModeScanLookupResponse =
  | { success: true; result: { kind: "not_found" } }
  | { success: true; result: { kind: "sponsor_comp_redemption"; redemption: SponsorCompRedemptionResult } }
  | {
      success: true;
      result: {
        kind: "found";
        reservation: {
          id: string;
          customerName: string;
          ticketCount: number;
          seatLabels: string[];
          admissionLabel: string;
          reservationCategory: "paid_reserved" | "reserved_comp";
          submittedAt: string | null;
        };
        ticket: DoorModeScanLookupTicket | null;
      };
    }
  | { success: false; error: string };

export function deriveScannedDoorModeQuantities(params: {
  reservationTicketCount: number;
  checkedInCount: number;
}) {
  const totalEligibleTickets = Math.max(0, params.reservationTicketCount);
  const checkedInCount = Math.max(0, Math.min(params.checkedInCount, totalEligibleTickets));
  const remainingTickets = Math.max(0, totalEligibleTickets - checkedInCount);

  return {
    totalEligibleTickets,
    checkedInCount,
    remainingTickets,
    isMultiTicket: totalEligibleTickets > 1,
    isFullyCheckedIn: checkedInCount >= totalEligibleTickets,
  };
}

export function normalizeScannedReservationToken(value: string | null | undefined) {
  const normalized = value?.replace(/[\r\n]+/g, "").trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > MAX_SCANNED_TOKEN_LENGTH) return null;
  if (!/^stf_[A-Za-z0-9_-]+$/.test(normalized)) return null;
  return normalized;
}

export function classifyReservedScanAdmission(
  link: Pick<ShowReservedSeatingLink, "is_complimentary" | "seat_category">,
  ticket: Pick<ShowCompTicket, "ticket_type" | "notes"> | null,
) {
  if (ticket) {
    return {
      admissionLabel: checkInAdmissionLabel(ticket.ticket_type, ticket.notes),
      reservationCategory:
        ticket.ticket_type === "paid_online" ? ("paid_reserved" as const) : ("reserved_comp" as const),
    };
  }

  if (!link.is_complimentary && link.seat_category === "paid_reserved") {
    return {
      admissionLabel: "Paid Reserved",
      reservationCategory: "paid_reserved" as const,
    };
  }

  return {
    admissionLabel: "Reserved Comp",
    reservationCategory: "reserved_comp" as const,
  };
}

export function formatDoorScanSeatLabels(seatIds: string[]) {
  return sortReservedSeatIds(seatIds).map((seatId) => formatReservedSeatLabel(seatId));
}

import { createPrintRecord } from "./variable-contract";
import type { PrintRecord } from "./types";

export type PrintStudioShowLike = {
  name?: string | null;
  show_date?: string | null;
  show_start_time?: string | null;
  venue?: string | null;
};

export type PrintStudioCompTicketLike = {
  id: string;
  guest_name?: string | null;
  ticket_type?: string | null;
  order_id?: string | null;
};

export type PrintStudioReservedLinkLike = {
  id: string;
  customer_name?: string | null;
  source_ticket_id?: string | null;
  source_order_id?: string | null;
};

export type PrintStudioReservedAssignmentLike = {
  id: string;
  customer_name?: string | null;
  seat_id?: string | null;
  section?: string | null;
  row_label?: string | null;
  seat_number?: number | string | null;
  seat_category?: string | null;
};

export type PrintStudioSponsorTicketLike = {
  id: string;
  sponsorName?: string | null;
  ticketNumber?: string | null;
  seatLabel?: string | null;
  stubSeatLabel?: string | null;
  templateKind?: string | null;
  categoryLabel?: string | null;
};

export type PrintStudioGeneralAdmissionTicketLike = {
  id: string;
  ticketNumber?: string | null;
  ticketType?: string | null;
};

type AdapterContext = {
  show?: PrintStudioShowLike | null;
  formatShowDate?: (value: string | null | undefined) => string;
};

function clean(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value).trim();
  return text || undefined;
}

function showDefaults(context?: AdapterContext) {
  const show = context?.show;
  return {
    event_name: clean(show?.name),
    show_date: context?.formatShowDate ? context.formatShowDate(show?.show_date) : clean(show?.show_date),
    show_time: clean(show?.show_start_time),
    venue: clean(show?.venue),
  };
}

function reservedSeatLabel(assignment: PrintStudioReservedAssignmentLike) {
  const explicitSeatId = clean(assignment.seat_id);
  if (explicitSeatId) return explicitSeatId;

  const section = clean(assignment.section);
  const row = clean(assignment.row_label);
  const seatNumber = clean(assignment.seat_number);
  return [section, row && seatNumber ? `${row}${seatNumber}` : undefined].filter(Boolean).join("-") || undefined;
}

export function mapCompTicketToPrintRecord(ticket: PrintStudioCompTicketLike, context?: AdapterContext): PrintRecord {
  const ticketNumber = clean(ticket.order_id) || ticket.id;
  const guestName = clean(ticket.guest_name);

  return createPrintRecord({
    id: `comp-ticket-${ticket.id}`,
    displayName: guestName || ticketNumber,
    ...showDefaults(context),
    purchaser_name: guestName,
    guest_name: guestName,
    ticket_type: clean(ticket.ticket_type),
    ticket_number: ticketNumber,
  });
}

export function mapReservedLinkToPrintRecord(link: PrintStudioReservedLinkLike, context?: AdapterContext): PrintRecord {
  const purchaserName = clean(link.customer_name);
  const ticketNumber = clean(link.source_order_id) || clean(link.source_ticket_id) || link.id;

  return createPrintRecord({
    id: `reserved-link-${link.id}`,
    displayName: purchaserName || ticketNumber,
    ...showDefaults(context),
    purchaser_name: purchaserName,
    ticket_type: "Reserved Admission",
    ticket_number: ticketNumber,
  });
}

export function mapReservedAssignmentToPrintRecord(assignment: PrintStudioReservedAssignmentLike, context?: AdapterContext): PrintRecord {
  const purchaserName = clean(assignment.customer_name);
  const seat = reservedSeatLabel(assignment);

  return createPrintRecord({
    id: `reserved-assignment-${assignment.id}`,
    displayName: [purchaserName, seat].filter(Boolean).join(" - ") || assignment.id,
    ...showDefaults(context),
    purchaser_name: purchaserName,
    ticket_type: clean(assignment.seat_category) || "Reserved Admission",
    seat,
    section: clean(assignment.section),
    ticket_number: assignment.id,
  });
}

export function mapSponsorTicketToPrintRecord(ticket: PrintStudioSponsorTicketLike, context?: AdapterContext): PrintRecord {
  const sponsorName = clean(ticket.sponsorName);
  const seat = clean(ticket.seatLabel) || clean(ticket.stubSeatLabel);
  const ticketNumber = clean(ticket.ticketNumber) || ticket.id;

  return createPrintRecord({
    id: `sponsor-ticket-${ticket.id}`,
    displayName: [sponsorName, seat].filter(Boolean).join(" - ") || ticketNumber,
    ...showDefaults(context),
    sponsor_name: sponsorName,
    purchaser_name: sponsorName,
    ticket_type: clean(ticket.categoryLabel) || clean(ticket.templateKind) || "Sponsor Ticket",
    seat,
    ticket_number: ticketNumber,
  });
}

export function mapGeneralAdmissionTicketToPrintRecord(ticket: PrintStudioGeneralAdmissionTicketLike, context?: AdapterContext): PrintRecord {
  const ticketNumber = clean(ticket.ticketNumber) || ticket.id;

  return createPrintRecord({
    id: `general-admission-ticket-${ticket.id}`,
    displayName: ticketNumber,
    ...showDefaults(context),
    ticket_type: clean(ticket.ticketType) || "General Admission",
    seat: "GENERAL",
    ticket_number: ticketNumber,
  });
}

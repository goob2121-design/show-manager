export const TICKET_SALE_STATUSES = ["not_on_sale", "presale", "public"] as const;

export type TicketSaleStatus = (typeof TICKET_SALE_STATUSES)[number];

export function isTicketSaleStatus(value: unknown): value is TicketSaleStatus {
  return typeof value === "string" && TICKET_SALE_STATUSES.includes(value as TicketSaleStatus);
}

export function normalizeTicketSaleStatus(value: unknown): TicketSaleStatus {
  return isTicketSaleStatus(value) ? value : "public";
}

export function ticketSaleStatusLabel(status: TicketSaleStatus) {
  if (status === "not_on_sale") return "NOT ON SALE";
  if (status === "presale") return "PRESALE / EARLY ACCESS";
  return "PUBLIC SALE";
}

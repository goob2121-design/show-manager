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

export type TicketSaleScheduleInput = {
  ticket_sale_status: unknown;
  presale_starts_at: string | null | undefined;
  public_sale_starts_at: string | null | undefined;
};

export type EffectiveTicketSaleState = {
  status: TicketSaleStatus;
  configuredStatus: TicketSaleStatus;
  scheduleEnabled: boolean;
  manualOverride: boolean;
  configurationError: string | null;
};

function timestamp(value: string | null | undefined) {
  if (!value?.trim()) return { value: null, invalid: false };
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? { value: parsed, invalid: false } : { value: null, invalid: true };
}

export function getEffectiveTicketSaleState(input: TicketSaleScheduleInput, now = new Date()): EffectiveTicketSaleState {
  const configuredStatus = normalizeTicketSaleStatus(input.ticket_sale_status);
  const presale = timestamp(input.presale_starts_at);
  const publicSale = timestamp(input.public_sale_starts_at);
  const scheduleEnabled = presale.value !== null || publicSale.value !== null;
  let configurationError: string | null = null;
  if (presale.invalid) configurationError = "Presale start must be a valid date and time.";
  else if (publicSale.invalid) configurationError = "Public sale start must be a valid date and time.";
  else if (presale.value !== null && publicSale.value !== null && publicSale.value < presale.value) {
    configurationError = "Public sale start cannot be before presale start.";
  }

  if (configuredStatus === "not_on_sale") {
    return { status: "not_on_sale", configuredStatus, scheduleEnabled, manualOverride: true, configurationError };
  }
  if (configurationError) {
    return { status: "not_on_sale", configuredStatus, scheduleEnabled, manualOverride: false, configurationError };
  }
  if (!scheduleEnabled) {
    return { status: configuredStatus, configuredStatus, scheduleEnabled: false, manualOverride: false, configurationError: null };
  }

  const nowTime = now.getTime();
  if (publicSale.value !== null && nowTime >= publicSale.value) {
    return { status: "public", configuredStatus, scheduleEnabled: true, manualOverride: false, configurationError: null };
  }
  if (presale.value !== null && nowTime >= presale.value) {
    return { status: "presale", configuredStatus, scheduleEnabled: true, manualOverride: false, configurationError: null };
  }
  return { status: "not_on_sale", configuredStatus, scheduleEnabled: true, manualOverride: false, configurationError: null };
}

export function effectiveTicketSaleStatus(input: TicketSaleScheduleInput, now = new Date()) {
  return getEffectiveTicketSaleState(input, now).status;
}

export function validateTicketSaleSchedule(input: TicketSaleScheduleInput) {
  return getEffectiveTicketSaleState(input).configurationError;
}

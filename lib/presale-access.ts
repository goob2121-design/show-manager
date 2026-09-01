import { createHash, timingSafeEqual } from "node:crypto";
import { effectiveTicketSaleStatus, type TicketSaleScheduleInput } from "./ticket-sale-status";

export type PresaleAccessShow = TicketSaleScheduleInput & {
  presale_access_code: string | null | undefined;
  ticket_link: string | null | undefined;
};

export function normalizePresaleAccessCode(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function digest(value: string) {
  return createHash("sha256").update(value.toLocaleLowerCase("en-US"), "utf8").digest();
}

export function validatePresaleAccess(show: PresaleAccessShow, submittedCode: unknown, now = new Date()) {
  if (effectiveTicketSaleStatus(show, now) !== "presale") return false;
  const configuredCode = normalizePresaleAccessCode(show.presale_access_code);
  const candidateCode = normalizePresaleAccessCode(submittedCode);
  if (!configuredCode || !candidateCode) return false;
  return timingSafeEqual(digest(configuredCode), digest(candidateCode));
}

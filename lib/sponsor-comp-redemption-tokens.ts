import { generateReservationScanToken } from "@/lib/reservation-scan-tokens";

export const SPONSOR_COMP_TOKEN_PREFIX = "stf_scomp_";

export type SponsorCompRedemptionStatus = "REDEEMED" | "ALREADY_REDEEMED" | "ALLOCATION_FULL" | "VOIDED" | "WRONG_SHOW";

export type SponsorCompRedemptionResult = {
  resultStatus: SponsorCompRedemptionStatus;
  tokenId: string | null;
  showSponsorId: string | null;
  sponsorName: string | null;
  ordinal: number | null;
  allowance: number | null;
  checkedIn: number | null;
  remaining: number | null;
  redeemedAt: string | null;
};

export function isSponsorCompRedemptionToken(value: string | null | undefined) {
  return value?.startsWith(SPONSOR_COMP_TOKEN_PREFIX) ?? false;
}

export function generateSponsorCompRedemptionToken() {
  return generateReservationScanToken().replace(/^stf_/, SPONSOR_COMP_TOKEN_PREFIX);
}

export function generateSponsorCompRedemptionTokenSet(quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Sponsor token quantity must be a positive integer.");
  const tokens = new Set<string>();
  while (tokens.size < quantity) tokens.add(generateSponsorCompRedemptionToken());
  return [...tokens];
}

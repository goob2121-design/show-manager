export type SponsorCompPrintToken = {
  id: string;
  token: string;
  ordinal: number;
  redeemed_at: string | null;
  voided_at: string | null;
};

export type SponsorCompPrintRecord = {
  id: string;
  displayName: string;
  sponsor_name: string;
  event_name: string;
  show_date: string;
  ticket_number: string;
  sponsor_comp_redemption_token: string;
  sponsor_comp_ticket_status: string;
};

export function buildSponsorCompPrintRecords(input: {
  sponsorName: string;
  showName: string;
  showDate: string;
  allowance: number;
  tokens: SponsorCompPrintToken[];
}) {
  const total = input.tokens.length;
  return [...input.tokens]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((token) => ({
      id: `sponsor-comp-token-${token.id}`,
      displayName: `${input.sponsorName} · Ticket ${token.ordinal} of ${total}`,
      sponsor_name: input.sponsorName,
      event_name: input.showName,
      show_date: input.showDate,
      ticket_number: `Ticket ${token.ordinal} of ${total}`,
      sponsor_comp_redemption_token: token.token,
      sponsor_comp_ticket_status: token.redeemed_at ? "Redeemed" : token.voided_at ? "Voided" : "Available",
    } satisfies SponsorCompPrintRecord));
}

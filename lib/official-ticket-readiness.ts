export type OfficialTicketReadiness = {
  ready: boolean;
  label: "Ready" | "Tickets Not Yet Emailed";
};

export function getOfficialTicketReadiness(ticketEmailedAt: string | null | undefined): OfficialTicketReadiness {
  return ticketEmailedAt
    ? { ready: true, label: "Ready" }
    : { ready: false, label: "Tickets Not Yet Emailed" };
}

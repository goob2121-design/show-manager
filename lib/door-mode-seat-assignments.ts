import type { SupabaseClient } from "@supabase/supabase-js";

export type DoorModeSeatAssignment = {
  projectedTicketId: string;
  seatIds: string[];
  isSponsorReservedProjection: boolean;
};

type ProjectionSourceRow = {
  source_id: string;
  projected_ticket_id: string;
};

type DirectReservedLinkRow = {
  id: string;
  source_ticket_id: string | null;
  source_show_sponsor_id?: string | null;
  customer_name?: string | null;
  is_complimentary?: boolean;
  source_note?: string | null;
};

type SponsorNameRow = {
  comp_ticket_allowance: number | null;
  custom_note: string | null;
  sponsor: { name: string | null } | { name: string | null }[] | null;
};

type SeatAssignmentRow = {
  seating_link_id: string | null;
  seat_id: string;
};

export function buildDoorModeSeatAssignments(
  projections: ProjectionSourceRow[],
  directLinks: DirectReservedLinkRow[],
  assignments: SeatAssignmentRow[],
  canonicalSeatIds: readonly string[],
  sponsors: SponsorNameRow[] = [],
): DoorModeSeatAssignment[] {
  const ticketIdsByLinkId = new Map<string, Set<string>>();
  const seatIdsByTicketId = new Map<string, Set<string>>();
  const sponsorProjectionTicketIds = new Set<string>();
  const canonicalPosition = new Map(canonicalSeatIds.map((seatId, index) => [seatId, index]));
  const projectedTicketIdByLinkId = new Map(
    projections.map((projection) => [projection.source_id, projection.projected_ticket_id]),
  );
  const sponsorNames = new Set(
    sponsors
      .filter((sponsor) => (sponsor.comp_ticket_allowance ?? 0) > 0)
      .flatMap((sponsor) => {
        const librarySponsor = Array.isArray(sponsor.sponsor) ? sponsor.sponsor[0] : sponsor.sponsor;
        return [librarySponsor?.name, sponsor.custom_note]
          .map((name) => name?.trim().toLowerCase() ?? "")
          .filter(Boolean);
      }),
  );

  function registerOwnership(linkId: string, ticketId: string) {
    const ticketIds = ticketIdsByLinkId.get(linkId) ?? new Set<string>();
    ticketIds.add(ticketId);
    ticketIdsByLinkId.set(linkId, ticketIds);
    if (!seatIdsByTicketId.has(ticketId)) seatIdsByTicketId.set(ticketId, new Set());
  }

  for (const projection of projections) {
    registerOwnership(projection.source_id, projection.projected_ticket_id);
  }
  for (const link of directLinks) {
    if (link.source_ticket_id) registerOwnership(link.id, link.source_ticket_id);

    const projectedTicketId = projectedTicketIdByLinkId.get(link.id);
    if (!projectedTicketId || !link.is_complimentary) continue;
    const sourceIdentifiesSponsor = Boolean(link.source_show_sponsor_id)
      || /(?:\[comp type:\s*sponsor\]|\bsponsor comp\b)/i.test(link.source_note ?? "");
    const sponsorNameMatches = sponsorNames.has(link.customer_name?.trim().toLowerCase() ?? "");
    if (sourceIdentifiesSponsor || sponsorNameMatches) sponsorProjectionTicketIds.add(projectedTicketId);
  }

  for (const assignment of assignments) {
    if (!assignment.seating_link_id || !canonicalPosition.has(assignment.seat_id)) continue;
    for (const ticketId of ticketIdsByLinkId.get(assignment.seating_link_id) ?? []) {
      seatIdsByTicketId.get(ticketId)?.add(assignment.seat_id);
    }
  }

  return [...seatIdsByTicketId.entries()].map(([projectedTicketId, seatIds]) => ({
    projectedTicketId,
    seatIds: [...seatIds].sort(
      (left, right) => canonicalPosition.get(left)! - canonicalPosition.get(right)!,
    ),
    isSponsorReservedProjection: sponsorProjectionTicketIds.has(projectedTicketId),
  }));
}

export async function loadDoorModeSeatAssignments(
  supabase: Pick<SupabaseClient, "from">,
  showId: string,
  canonicalSeatIds: readonly string[],
): Promise<DoorModeSeatAssignment[]> {
  const { data: projectionData, error: projectionError } = await supabase
    .from("show_admission_projection_sources")
    .select("source_id, projected_ticket_id")
    .eq("show_id", showId)
    .eq("source_type", "reserved_link");
  if (projectionError) throw projectionError;

  const { data: directLinkData, error: directLinkError } = await supabase
    .from("show_reserved_seating_links")
    .select("id, source_ticket_id, source_show_sponsor_id, customer_name, is_complimentary, source_note")
    .eq("show_id", showId);
  if (directLinkError) throw directLinkError;

  const { data: sponsorData, error: sponsorError } = await supabase
    .from("show_sponsors")
    .select("comp_ticket_allowance, custom_note, sponsor:sponsor_library(name)")
    .eq("show_id", showId);
  if (sponsorError) throw sponsorError;

  const projections = (projectionData ?? []) as ProjectionSourceRow[];
  const directLinks = (directLinkData ?? []) as DirectReservedLinkRow[];
  const linkIds = [...new Set([
    ...projections.map((projection) => projection.source_id),
    ...directLinks.map((link) => link.id),
  ])];
  if (linkIds.length === 0) return [];

  const { data: assignmentData, error: assignmentError } = await supabase
    .from("show_reserved_seat_assignments")
    .select("seating_link_id, seat_id")
    .eq("show_id", showId)
    .in("seating_link_id", linkIds);
  if (assignmentError) throw assignmentError;

  return buildDoorModeSeatAssignments(
    projections,
    directLinks,
    (assignmentData ?? []) as SeatAssignmentRow[],
    canonicalSeatIds,
    (sponsorData ?? []) as SponsorNameRow[],
  );
}

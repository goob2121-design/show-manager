import type { SupabaseClient } from "@supabase/supabase-js";

export type DoorModeSeatAssignment = {
  projectedTicketId: string;
  seatIds: string[];
};

type ProjectionSourceRow = {
  source_id: string;
  projected_ticket_id: string;
};

type SeatAssignmentRow = {
  seating_link_id: string | null;
  seat_id: string;
};

export function buildDoorModeSeatAssignments(
  projections: ProjectionSourceRow[],
  assignments: SeatAssignmentRow[],
): DoorModeSeatAssignment[] {
  const projectedTicketIdByLinkId = new Map(
    projections.map((projection) => [projection.source_id, projection.projected_ticket_id]),
  );
  const seatIdsByProjectedTicketId = new Map<string, Set<string>>();

  for (const projection of projections) {
    if (!seatIdsByProjectedTicketId.has(projection.projected_ticket_id)) {
      seatIdsByProjectedTicketId.set(projection.projected_ticket_id, new Set());
    }
  }

  for (const assignment of assignments) {
    if (!assignment.seating_link_id) continue;
    const projectedTicketId = projectedTicketIdByLinkId.get(assignment.seating_link_id);
    if (!projectedTicketId || !assignment.seat_id) continue;
    seatIdsByProjectedTicketId.get(projectedTicketId)?.add(assignment.seat_id);
  }

  return [...seatIdsByProjectedTicketId.entries()].map(([projectedTicketId, seatIds]) => ({
    projectedTicketId,
    seatIds: [...seatIds],
  }));
}

export async function loadDoorModeSeatAssignments(
  supabase: Pick<SupabaseClient, "from">,
  showId: string,
): Promise<DoorModeSeatAssignment[]> {
  const { data: projectionData, error: projectionError } = await supabase
    .from("show_admission_projection_sources")
    .select("source_id, projected_ticket_id")
    .eq("show_id", showId)
    .eq("source_type", "reserved_link");

  if (projectionError) throw projectionError;
  const projections = (projectionData ?? []) as ProjectionSourceRow[];
  if (projections.length === 0) return [];

  const linkIds = [...new Set(projections.map((projection) => projection.source_id))];
  const { data: assignmentData, error: assignmentError } = await supabase
    .from("show_reserved_seat_assignments")
    .select("seating_link_id, seat_id")
    .eq("show_id", showId)
    .in("seating_link_id", linkIds);

  if (assignmentError) throw assignmentError;
  return buildDoorModeSeatAssignments(
    projections,
    (assignmentData ?? []) as SeatAssignmentRow[],
  );
}
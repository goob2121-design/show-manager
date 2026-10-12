import { notFound } from "next/navigation";
import { ReservedSeatSelectionPage } from "@/app/components/reserved-seat-selection-page";
import { loadReservedSeatPayAtDoorTicket } from "@/lib/reserved-seat-pay-at-door-ticket";
import { isReservedChildSeatsEnabled } from "@/lib/reserved-child-seats";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { ShowRecord, ShowReservedSeatAssignment, ShowReservedSeatingLink } from "@/lib/types";

type PublicSeatAssignment = Pick<ShowReservedSeatAssignment, "seat_id" | "seating_link_id" | "assignment_type" | "occupant_type">;

export const runtime = "nodejs";

type ReservedSeatingPageProps = {
  params: Promise<{ token: string }>;
};

export default async function ReservedSeatingPage({ params }: ReservedSeatingPageProps) {
  const { token } = await params;
  const supabase = createServiceSupabaseClient();

  const { data: seatingLink, error: seatingLinkError } = await supabase
    .from("show_reserved_seating_links")
    .select("*")
    .eq("selection_token", token)
    .maybeSingle();

  if (seatingLinkError || !seatingLink) {
    notFound();
  }

  const [{ data: show }, { data: assignments }] = await Promise.all([
    supabase
      .from("shows")
      .select("name, show_date, show_start_time, venue, show_logo_url, ticket_code_format")
      .eq("id", seatingLink.show_id)
      .maybeSingle(),
    supabase
      .from("show_reserved_seat_assignments")
      .select("seat_id, seating_link_id, assignment_type, occupant_type")
      .eq("show_id", seatingLink.show_id)
      .order("created_at", { ascending: true }),
  ]);

  const typedShow = show as Pick<ShowRecord, "name" | "show_date" | "show_start_time" | "venue" | "show_logo_url" | "ticket_code_format"> | null;
  const typedSeatingLink = seatingLink as ShowReservedSeatingLink;
  const typedAssignments = (assignments ?? []) as PublicSeatAssignment[];

  if (!typedShow) {
    notFound();
  }

  const payAtDoorTicket = await loadReservedSeatPayAtDoorTicket(supabase, typedSeatingLink);

  return (
    <ReservedSeatSelectionPage
      show={typedShow}
      seatingLink={typedSeatingLink}
      assignments={typedAssignments}
      payAtDoorTicket={payAtDoorTicket}
      childSeatsEnabled={isReservedChildSeatsEnabled()}
    />
  );
}

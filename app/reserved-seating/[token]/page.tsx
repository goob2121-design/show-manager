import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { ReservedSeatSelectionPage } from "@/app/components/reserved-seat-selection-page";
import { loadReservedSeatPayAtDoorTicket } from "@/lib/reserved-seat-pay-at-door-ticket";
import { isReservedChildSeatsEnabled } from "@/lib/reserved-child-seats";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { ShowRecord, ShowReservedSeatAssignment, ShowReservedSeatingLink } from "@/lib/types";

type PublicSeatAssignment = Pick<ShowReservedSeatAssignment, "seat_id" | "seating_link_id" | "assignment_type" | "occupant_type">;

export const runtime = "nodejs";

type ReservedSeatingPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ adminFamily?: string }>;
};

export default async function ReservedSeatingPage({ params, searchParams }: ReservedSeatingPageProps) {
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
      .select("slug, name, show_date, show_start_time, venue, show_logo_url, ticket_code_format")
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
  const query = await searchParams;
  const cookieStore = await cookies();
  const showSlug = show?.slug;
  const adminFamilyEditing = Boolean(query.adminFamily === "1" && showSlug
    && verifyAdminSessionCookieValue(showSlug, cookieStore.get(getAdminSessionCookieName(showSlug))?.value));
  if (query.adminFamily === "1" && !adminFamilyEditing) notFound();
  let familySelectionEligible = false;
  if (isReservedChildSeatsEnabled() && !typedSeatingLink.is_complimentary && typedSeatingLink.seat_category === "paid_reserved") {
    let ticketId = typedSeatingLink.source_ticket_id;
    if (!ticketId) {
      const { data: projection } = await supabase.from("show_admission_projection_sources")
        .select("projected_ticket_id").eq("show_id", typedSeatingLink.show_id)
        .eq("source_type", "reserved_link").eq("source_id", typedSeatingLink.id).maybeSingle();
      ticketId = projection?.projected_ticket_id ?? null;
    }
    if (ticketId) {
      const { data: admission } = await supabase.from("show_comp_tickets").select("ticket_type")
        .eq("show_id", typedSeatingLink.show_id).eq("id", ticketId).maybeSingle();
      familySelectionEligible = admission?.ticket_type === "paid_online";
    }
  }

  return (
    <ReservedSeatSelectionPage
      show={typedShow}
      seatingLink={typedSeatingLink}
      assignments={typedAssignments}
      payAtDoorTicket={payAtDoorTicket}
      childSeatsEnabled={isReservedChildSeatsEnabled()}
      familySelectionEligible={familySelectionEligible}
      adminFamilyEditing={adminFamilyEditing}
    />
  );
}

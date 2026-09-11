import type { SupabaseClient } from "@supabase/supabase-js";

type ReservedSeatAdmissionSource = {
  id: string;
  show_id: string;
  source_ticket_id: string | null;
};

type PayAtDoorAdmission = {
  pay_at_door: boolean | null;
  pay_at_door_amount: number | null;
};

export type ReservedSeatPayAtDoorTicket = {
  isPayAtDoor: boolean;
  amount: number | null;
};

/**
 * Resolves the already-projected admission for a reservation. This is a
 * read-only lookup; payment completion remains exclusively in Door Mode.
 */
export async function loadReservedSeatPayAtDoorTicket(
  supabase: SupabaseClient,
  reservation: ReservedSeatAdmissionSource,
): Promise<ReservedSeatPayAtDoorTicket | null> {
  let ticketId = reservation.source_ticket_id;

  if (!ticketId) {
    const { data: projection, error: projectionError } = await supabase
      .from("show_admission_projection_sources")
      .select("projected_ticket_id")
      .eq("show_id", reservation.show_id)
      .eq("source_type", "reserved_link")
      .eq("source_id", reservation.id)
      .maybeSingle();
    if (projectionError) throw projectionError;
    ticketId = projection?.projected_ticket_id ?? null;
  }

  if (!ticketId) return null;

  const { data: ticket, error: ticketError } = await supabase
    .from("show_comp_tickets")
    .select("pay_at_door,pay_at_door_amount")
    .eq("id", ticketId)
    .eq("show_id", reservation.show_id)
    .maybeSingle();
  if (ticketError) throw ticketError;
  if (!ticket) return null;

  const admission = ticket as PayAtDoorAdmission;
  return {
    isPayAtDoor: admission.pay_at_door === true,
    amount: admission.pay_at_door_amount,
  };
}

export function formatReservedSeatPayAtDoorDue(amount: number | null | undefined) {
  return typeof amount === "number" && Number.isFinite(amount)
    ? `$${amount.toFixed(2)} DUE AT DOOR`
    : "PAYMENT DUE AT DOOR";
}

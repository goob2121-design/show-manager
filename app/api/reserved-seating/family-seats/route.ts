import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { RESERVED_SEAT_DEFINITIONS, sortReservedSeatIds } from "@/lib/reserved-seating";
import { getReservedFamilySeatUpdateError, isReservedChildSeatsEnabled } from "@/lib/reserved-child-seats";
import { deliverOfficialTicketEmail } from "@/lib/email/official-ticket-email";

export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Reserved child seating is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function seatIds(value: unknown) {
  if (!Array.isArray(value)) return null;
  const validIds = new Set(RESERVED_SEAT_DEFINITIONS.map((seat) => seat.seatId));
  const normalized = value.filter((item): item is string => typeof item === "string").map((item) => item.trim());
  if (normalized.some((item) => !validIds.has(item))) return null;
  return sortReservedSeatIds(normalized);
}

export async function POST(request: Request) {
  if (!isReservedChildSeatsEnabled()) {
    return NextResponse.json({ success: false, error: "Free children's seat selection is not enabled yet." }, { status: 404 });
  }

  try {
    const body = await request.json() as { token?: unknown; paidSeatIds?: unknown; childSeatIds?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const paidSeatIds = seatIds(body.paidSeatIds);
    const childSeatIds = seatIds(body.childSeatIds);
    if (!token || !paidSeatIds || !childSeatIds) {
      return NextResponse.json({ success: false, error: "A valid reservation and seat selection are required." }, { status: 400 });
    }

    const supabase = serviceClient();
    const { data: reservation, error: reservationError } = await supabase.from("show_reserved_seating_links")
      .select("id,child_seat_limit").eq("selection_token", token).maybeSingle();
    if (reservationError) throw reservationError;
    if (!reservation) return NextResponse.json({ success: false, error: "This reservation link was not found." }, { status: 404 });
    const { data: previousSeats, error: previousSeatsError } = await supabase.from("show_reserved_seat_assignments")
      .select("seat_id,occupant_type").eq("seating_link_id", reservation.id);
    if (previousSeatsError) throw previousSeatsError;
    const previousPaid = sortReservedSeatIds((previousSeats ?? []).filter((seat) => seat.occupant_type !== "child_free").map((seat) => seat.seat_id));
    const previousChildren = sortReservedSeatIds((previousSeats ?? []).filter((seat) => seat.occupant_type === "child_free").map((seat) => seat.seat_id));
    const seatingChanged = JSON.stringify([previousPaid, previousChildren]) !== JSON.stringify([paidSeatIds, childSeatIds]);

    // A no-op must preserve assignment UUIDs, which identify the saved email version.
    if (!seatingChanged) {
      return NextResponse.json({
        success: true,
        ticketEmailMessage: "Your family seating is unchanged. Your existing ticket code remains valid.",
        result: {
          resultStatus: "UNCHANGED",
          paidSeatCount: previousPaid.length,
          childSeatCount: previousChildren.length,
          totalSeatCount: previousPaid.length + previousChildren.length,
          childSeatLimit: reservation.child_seat_limit,
        },
      });
    }

    const { data, error } = await supabase.rpc("replace_reserved_family_seats", {
      p_selection_token: token,
      p_paid_seat_ids: paidSeatIds,
      p_child_seat_ids: childSeatIds,
    });
    if (error) throw error;
    const result = (data as Array<Record<string, unknown>> | null)?.[0];
    const status = typeof result?.result_status === "string" ? result.result_status : "UNKNOWN";
    const childSeatLimit = Number(result?.child_seat_limit ?? 0);
    const message = getReservedFamilySeatUpdateError(status, childSeatLimit);
    if (message) {
      const responseStatus = status === "NOT_FOUND" ? 404 : status === "SEAT_CONFLICT" ? 409 : 400;
      return NextResponse.json({ success: false, error: message, resultStatus: status }, { status: responseStatus });
    }

    let ticketEmailDelivered: boolean | undefined;
    let ticketEmailMessage = "Your family seating is unchanged. Your existing ticket code remains valid.";
    if (seatingChanged) {
      ticketEmailDelivered = false;
      ticketEmailMessage = "Your family seats are saved and your existing ticket code remains valid, but the updated email could not be sent. Use Email Ticket Again to retry.";
      try {
        const delivery = await deliverOfficialTicketEmail(supabase, String(result?.reservation_id), {
          requestOrigin: new URL(request.url).origin,
          updatedConfirmation: true,
        });
        ticketEmailDelivered = delivery.success;
        if (delivery.success) ticketEmailMessage = "Your family seats are saved. An updated confirmation email is on its way. Your existing ticket code remains valid.";
      } catch (emailError) {
        console.error("Updated family confirmation email failed after seats were saved.", {
          reservationId: reservation.id,
          message: emailError instanceof Error ? emailError.message : "Unknown email error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      ticketEmailDelivered,
      ticketEmailMessage,
      result: {
        resultStatus: status,
        paidSeatCount: Number(result?.paid_seat_count ?? 0),
        childSeatCount: Number(result?.child_seat_count ?? 0),
        totalSeatCount: Number(result?.total_seat_count ?? 0),
        childSeatLimit,
      },
    });
  } catch (error) {
    console.error("Reserved family seat update failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to update the family's reserved seats right now." }, { status: 500 });
  }
}

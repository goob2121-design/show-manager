import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { RESERVED_SEAT_DEFINITIONS, formatReservedSeatLabel, getReservedSeatDefinition, sortReservedSeatIds } from "@/lib/reserved-seating";
import type { ShowReservedSeatingLink } from "@/lib/types";

export const runtime = "nodejs";

type SubmitReservedSeatsRequestBody = {
  token?: unknown;
  seatIds?: unknown;
};

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing server-side Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubmitReservedSeatsRequestBody;
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const seatIds = Array.isArray(body.seatIds)
      ? body.seatIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim())
      : [];

    if (!token) {
      return NextResponse.json({ success: false, error: "Token is required." }, { status: 400 });
    }

    const uniqueSeatIds = sortReservedSeatIds(Array.from(new Set(seatIds)));

    if (uniqueSeatIds.length === 0) {
      return NextResponse.json({ success: false, error: "Select at least one seat." }, { status: 400 });
    }

    const invalidSeatId = uniqueSeatIds.find((seatId) => !RESERVED_SEAT_DEFINITIONS.some((seat) => seat.seatId === seatId));
    if (invalidSeatId) {
      return NextResponse.json({ success: false, error: `Invalid seat: ${invalidSeatId}` }, { status: 400 });
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data: seatingLink, error: seatingLinkError } = await supabase
      .from("show_reserved_seating_links")
      .select("*")
      .eq("selection_token", token)
      .maybeSingle();

    const typedSeatingLink = seatingLink as ShowReservedSeatingLink | null;

    if (seatingLinkError || !typedSeatingLink) {
      return NextResponse.json({ success: false, error: "Reserved seating link not found." }, { status: 404 });
    }

    if (typedSeatingLink.submitted_at) {
      return NextResponse.json({ success: false, error: "This reserved seating link has already been used." }, { status: 409 });
    }

    if (uniqueSeatIds.length > typedSeatingLink.ticket_count) {
      return NextResponse.json(
        {
          success: false,
          error: `You may only reserve up to ${typedSeatingLink.ticket_count} seat${typedSeatingLink.ticket_count === 1 ? "" : "s"}.`,
        },
        { status: 400 },
      );
    }

    const { data: existingAssignments, error: existingAssignmentsError } = await supabase
      .from("show_reserved_seat_assignments")
      .select("seat_id, seating_link_id, assignment_type")
      .eq("show_id", typedSeatingLink.show_id)
      .in("seat_id", uniqueSeatIds);

    if (existingAssignmentsError) {
      return NextResponse.json({ success: false, error: existingAssignmentsError.message }, { status: 500 });
    }

    const blockedAssignment = (existingAssignments ?? []).find((assignment) => assignment.assignment_type === "blocked");
    if (blockedAssignment) {
      return NextResponse.json(
        {
          success: false,
          error: `${formatReservedSeatLabel(blockedAssignment.seat_id ?? "")} is unavailable.`,
        },
        { status: 409 },
      );
    }

    const conflictingAssignment = (existingAssignments ?? []).find(
      (assignment) => assignment.assignment_type !== "blocked" && assignment.seating_link_id !== typedSeatingLink.id,
    );

    if (conflictingAssignment) {
      return NextResponse.json(
        {
          success: false,
          error: `${formatReservedSeatLabel(conflictingAssignment.seat_id ?? "")} is no longer available.`,
        },
        { status: 409 },
      );
    }

    const assignmentRows = uniqueSeatIds.map((seatId) => {
      const definition = getReservedSeatDefinition(seatId);
      return {
        show_id: typedSeatingLink.show_id,
        seating_link_id: typedSeatingLink.id,
        customer_name: typedSeatingLink.customer_name,
        email: typedSeatingLink.email,
        seat_id: seatId,
        section: definition?.section ?? seatId.slice(0, 1),
        row_label: definition?.rowLabel ?? seatId.slice(2, 3),
        seat_number: definition?.seatNumber ?? 0,
        assignment_type: "customer",
      };
    });

    const { error: insertError } = await supabase.from("show_reserved_seat_assignments").insert(assignmentRows);

    if (insertError) {
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    const submittedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("show_reserved_seating_links")
      .update({ submitted_at: submittedAt, sent_at: typedSeatingLink.sent_at ?? submittedAt, selection_mode: "customer" })
      .eq("id", typedSeatingLink.id);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        seatIds: uniqueSeatIds,
        submittedAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unable to submit reserved seats.",
      },
      { status: 500 },
    );
  }
}

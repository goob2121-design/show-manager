import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { RESERVED_SEAT_DEFINITIONS, sortReservedSeatIds } from "@/lib/reserved-seating";
import { getReservedFamilySeatUpdateError, isReservedChildSeatsEnabled } from "@/lib/reserved-child-seats";

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

    const { data, error } = await serviceClient().rpc("replace_reserved_family_seats", {
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

    return NextResponse.json({
      success: true,
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

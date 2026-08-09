import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName } from "@/lib/admin-session";
import { resolveDoorAccess } from "@/lib/door-access";
import { getDoorStaffSessionCookieName } from "@/lib/door-staff-session";
import { loadDoorModeSeatAssignments } from "@/lib/door-mode-seat-assignments";
import { RESERVED_SEAT_DEFINITIONS } from "@/lib/reserved-seating";

export const runtime = "nodejs";

interface DoorSeatAssignmentsRouteContext {
  params: Promise<{ showId: string }>;
}

function createReadOnlyServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Door Mode seat lookup is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: Request, context: DoorSeatAssignmentsRouteContext) {
  try {
    const { showId } = await context.params;
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug")?.trim() ?? "";
    if (!showId?.trim() || !slug) {
      return NextResponse.json({ success: false, error: "Show ID and slug are required." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const accessRole = resolveDoorAccess({
      slug,
      showId,
      adminCookieValue: cookieStore.get(getAdminSessionCookieName(slug))?.value,
      doorStaffCookieValue: cookieStore.get(getDoorStaffSessionCookieName(slug))?.value,
    });
    if (!accessRole) {
      return NextResponse.json({ success: false, error: "Door Mode access is required." }, { status: 401 });
    }

    const assignments = await loadDoorModeSeatAssignments(
      createReadOnlyServiceClient(),
      showId,
      RESERVED_SEAT_DEFINITIONS.map((seat) => seat.seatId),
    );
    return NextResponse.json(assignments);
  } catch (error) {
    console.error("Door Mode seat lookup failed.", error);
    return NextResponse.json(
      { success: false, error: "Unable to load Door Mode seat assignments." },
      { status: 500 },
    );
  }
}
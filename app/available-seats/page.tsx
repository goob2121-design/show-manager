import { notFound } from "next/navigation";
import { ReservedSeatMap } from "@/app/components/reserved-seat-map";
import type { ReservedSeatMapSeatState } from "@/app/components/reserved-seat-map";
import { RESERVED_SEAT_DEFINITIONS, RESERVED_SEATING_VENUE } from "@/lib/reserved-seating";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ShowRecord, ShowReservedSeatAssignment } from "@/lib/types";

export const runtime = "nodejs";

// Public URL for linking from cumberlandmountainmusic.com
export const PUBLIC_AVAILABLE_SEATS_PATH = "/available-seats";

function formatShowDate(showDate: string | null) {
  if (!showDate) {
    return "Date TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${showDate}T00:00:00`));
}

async function loadCurrentShow() {
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: upcomingShows, error: upcomingError } = await supabase
    .from("shows")
    .select("id, slug, name, show_date, venue, show_logo_url")
    .eq("is_archived", false)
    .gte("show_date", today)
    .order("show_date", { ascending: true })
    .limit(1);

  if (upcomingError) {
    throw upcomingError;
  }

  const upcomingShow = (upcomingShows?.[0] ?? null) as Pick<ShowRecord, "id" | "slug" | "name" | "show_date" | "venue" | "show_logo_url"> | null;
  if (upcomingShow) {
    return upcomingShow;
  }

  const { data: fallbackShows, error: fallbackError } = await supabase
    .from("shows")
    .select("id, slug, name, show_date, venue, show_logo_url")
    .eq("is_archived", false)
    .order("show_date", { ascending: false })
    .limit(1);

  if (fallbackError) {
    throw fallbackError;
  }

  return (fallbackShows?.[0] ?? null) as Pick<ShowRecord, "id" | "slug" | "name" | "show_date" | "venue" | "show_logo_url"> | null;
}

async function loadSeatAssignments(showId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("show_reserved_seat_assignments")
    .select("seat_id, assignment_type")
    .eq("show_id", showId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Pick<ShowReservedSeatAssignment, "seat_id" | "assignment_type">[];
}

function buildSeatStates(assignments: Pick<ShowReservedSeatAssignment, "seat_id" | "assignment_type">[]) {
  const assignmentBySeatId = new Map(assignments.map((assignment) => [assignment.seat_id, assignment]));

  return Object.fromEntries(
    RESERVED_SEAT_DEFINITIONS.map((seat) => {
      const assignment = assignmentBySeatId.get(seat.seatId);
      const status: ReservedSeatMapSeatState["status"] = assignment?.assignment_type === "blocked"
        ? "unavailable"
        : assignment
          ? "assigned"
          : "available";

      return [
        seat.seatId,
        {
          seatId: seat.seatId,
          label: seat.seatId,
          status,
          disabled: true,
        },
      ];
    }),
  ) as Record<string, ReservedSeatMapSeatState>;
}

export default async function AvailableSeatsPage() {
  const show = await loadCurrentShow();

  if (!show) {
    notFound();
  }

  const assignments = await loadSeatAssignments(show.id);
  const seatStates = buildSeatStates(assignments);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.12),_transparent_26%),linear-gradient(180deg,_#08111f,_#050913_58%,_#03060c)] px-4 py-6 text-slate-100 sm:px-6 sm:py-8">
      <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#08111f]/95 shadow-[0_24px_60px_rgba(2,6,23,0.45)]">
          <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_30%),linear-gradient(135deg,_#0a182a,_#091220_58%,_#040911)] px-4 py-5 text-white sm:px-6 lg:px-8 lg:py-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-center xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/30 shadow-[0_20px_40px_rgba(2,6,23,0.35)]">
                <img
                  src={RESERVED_SEATING_VENUE.venuePhotoPath}
                  alt={RESERVED_SEATING_VENUE.venueName}
                  className="h-48 w-full object-cover sm:h-56"
                />
              </div>
              <div>
                <span className="inline-flex rounded-full border border-emerald-300/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100">
                  Live Seat Availability
                </span>
                <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{RESERVED_SEATING_VENUE.venueName}</h1>
                <p className="mt-2 text-sm text-slate-200 sm:text-base">601 Colwyn St</p>
                <p className="text-sm text-slate-200 sm:text-base">Cumberland Gap, TN 37724</p>
                <p className="mt-4 text-lg font-semibold text-white">{show.name}</p>
                <p className="mt-1 text-sm text-slate-300 sm:text-base">{formatShowDate(show.show_date)}</p>
                <p className="mt-4 text-sm text-slate-200 sm:text-base">200-seat intimate theater setting</p>
                <p className="mt-1 text-sm text-slate-200 sm:text-base">All seats provide an excellent view of the stage.</p>
                <p className="mt-4 max-w-3xl text-sm text-slate-300 sm:text-base">
                  After purchasing tickets, you will receive a private seat-selection link by email. Seat availability shown here is live and may change before your purchase is completed.
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 py-6 sm:px-6">
            <ReservedSeatMap
              seatStates={seatStates}
              title="Current Seat Availability"
              helperText="Green seats are currently available. Red seats are already assigned. Gray seats are unavailable or blocked."
              includeSelectedLegend={false}
              showCustomerSeatDetails={false}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
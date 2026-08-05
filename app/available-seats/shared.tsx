import Image from "next/image";
import { notFound } from "next/navigation";
import { PUBLIC_AVAILABLE_SEATS_PATH, buildPublicAvailableSeatsPath } from "./path";
import { ReservedSeatMap } from "@/app/components/reserved-seat-map";
import type { ReservedSeatMapSeatState } from "@/app/components/reserved-seat-map";
import { RESERVED_SEAT_DEFINITIONS, RESERVED_SEATING_VENUE } from "@/lib/reserved-seating";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ShowRecord, ShowReservedSeatAssignment } from "@/lib/types";

export { PUBLIC_AVAILABLE_SEATS_PATH, buildPublicAvailableSeatsPath };

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

export async function loadDefaultAvailableSeatsShow() {
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

export async function loadAvailableSeatsShowBySlug(slug: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("shows")
    .select("id, slug, name, show_date, venue, show_logo_url")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as Pick<ShowRecord, "id" | "slug" | "name" | "show_date" | "venue" | "show_logo_url"> | null;
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
        },
      ];
    }),
  ) as Record<string, ReservedSeatMapSeatState>;
}

type AvailableSeatsViewProps = {
  show: Pick<ShowRecord, "id" | "slug" | "name" | "show_date" | "venue" | "show_logo_url"> | null;
};

export async function AvailableSeatsView({ show }: AvailableSeatsViewProps) {
  if (!show) {
    notFound();
  }

  const assignments = await loadSeatAssignments(show.id);
  const seatStates = buildSeatStates(assignments);
  const formattedShowDate = formatShowDate(show.show_date);
  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[radial-gradient(circle_at_top,rgba(200,155,60,0.08),transparent_24%),linear-gradient(180deg,#060708,#0a1018_46%,#070b11_100%)] px-4 py-5 text-[#f5f1e8] sm:px-6 sm:py-7 lg:px-8">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 overflow-x-hidden">
        <header className="relative overflow-hidden rounded-[1.8rem] border border-[rgba(200,155,60,0.18)] shadow-[0_24px_50px_rgba(0,0,0,0.32)]">
          <Image
            src="/cmms-header.png"
            alt=""
            fill
            priority
            aria-hidden="true"
            className="object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(rgba(8,9,12,0.38),rgba(8,9,12,0.62))]"
          />

          <div className="relative px-5 py-5 text-[#f5f1e8] sm:px-7 sm:py-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-4 right-4 hidden w-24 rounded-r-[22px] opacity-40 lg:block"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, rgba(200,155,60,0.22) 0px, rgba(200,155,60,0.22) 1px, transparent 1px, transparent 18px)",
              }}
            />

            <div className="grid items-center gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8">
              <div className="w-full max-w-[210px] sm:max-w-[230px] md:max-w-[220px] lg:max-w-[250px]">
                <Image
                  src="/cmms-logo.png"
                  alt="Cumberland Mountain Music Show logo"
                  width={320}
                  height={160}
                  className="h-auto w-full object-contain"
                  priority
                />
              </div>

              <div className="max-w-3xl space-y-2">
                <p className="inline-flex w-fit rounded-full border border-[rgba(200,155,60,0.34)] bg-[rgba(200,155,60,0.10)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#f2d38a] shadow-[0_0_18px_rgba(200,155,60,0.12)]">
                  Public Seat Availability
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-[#fffaf1] sm:text-3xl lg:text-[2.1rem]">
                  {show.name}
                </h1>
                <p className="text-sm font-medium text-[#f0d486] sm:text-base">{formattedShowDate}</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
          <div className="rounded-[1.5rem] border border-[rgba(200,155,60,0.16)] bg-[rgba(255,255,255,0.03)] px-4 py-4 shadow-[0_18px_34px_rgba(0,0,0,0.22)] sm:px-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d8b35b]">Venue</p>
            <h2 className="mt-2 text-xl font-semibold text-[#fffaf1]">Cumberland Gap Convention Center</h2>
            <p className="mt-2 text-sm text-[#ddd4c7]">601 Colwyn St</p>
            <p className="text-sm text-[#ddd4c7]">Cumberland Gap, TN 37724</p>
            <p className="mt-4 text-sm text-[#f0d486]">200-seat intimate theater setting</p>
            <p className="mt-1 text-sm text-[#ddd4c7]">All seats provide an excellent view of the stage.</p>
          </div>

          <div className="overflow-hidden rounded-[1.4rem] border border-[rgba(200,155,60,0.14)] bg-[rgba(255,255,255,0.03)] shadow-[0_18px_34px_rgba(0,0,0,0.22)]">
            <Image
              src={RESERVED_SEATING_VENUE.venuePhotoPath}
              alt={RESERVED_SEATING_VENUE.venueName}
              width={900}
              height={520}
              className="h-44 w-full object-cover sm:h-48"
            />
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-[rgba(200,155,60,0.24)] bg-[rgba(200,155,60,0.08)] px-4 py-4 text-sm text-[#f5f1e8] shadow-[0_18px_34px_rgba(0,0,0,0.18)] sm:px-5 sm:text-[15px]">
          <p className="font-semibold text-[#fffaf1]">Reserved Seating Information</p>
          <div className="mt-2 space-y-3 leading-7 text-[#e5dccf]">
            <p>Reserved seating is included with your advance ticket purchase.</p>
            <p>
              After completing your order, you&apos;ll <strong>automatically receive an email</strong> with a secure link to select your seats online at your convenience.
            </p>
            <p>
              <strong>Using a mobile phone?</strong> Swipe the seating chart left or right to view <strong>both sides</strong> of the convention center seating before choosing your seats.
            </p>
            <p>
              If you prefer not to choose your seats yourself, that&apos;s perfectly okay&mdash;<strong>we&apos;ll be happy to reserve seats for you</strong>.
            </p>
            <p>If you have any questions or don&apos;t receive your seat selection email, please check your spam folder, then contact us and we&apos;ll be glad to help.</p>
          </div>
        </section>

        <section className="rounded-[1.6rem] border border-[rgba(200,155,60,0.16)] bg-[rgba(255,255,255,0.03)] p-3 shadow-[0_22px_40px_rgba(0,0,0,0.22)] sm:p-4">
          <ReservedSeatMap
            seatStates={seatStates}
            title="Available Seats"
            helperText="Green seats are available. Red seats are already taken. Gray seats are unavailable."
            includeSelectedLegend={false}
            showCustomerSeatDetails={false}
            legendVariant="public"
            chromeVariant="cmms-public"
          />
        </section>

        <div className="flex justify-center">
          <a
            href="https://www.cumberlandmountainmusic.com/contact"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[rgba(200,155,60,0.18)] bg-[rgba(255,255,255,0.03)] px-4 py-2 text-center text-sm text-[#e9dece] shadow-[0_12px_24px_rgba(0,0,0,0.16)] transition hover:border-[rgba(200,155,60,0.3)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#fff7eb] sm:text-[15px]"
          >
            <span aria-hidden="true" className="text-[#d8b35b]">
              ?
            </span>
            <span>Questions or having trouble? Contact us and we&apos;ll be happy to help.</span>
          </a>
        </div>
      </section>
    </main>
  );
}

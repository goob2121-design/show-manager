"use client";

import { useMemo, useState } from "react";
import { ReservedSeatMap } from "@/app/components/reserved-seat-map";
import type { ReservedSeatMapSeatState } from "@/app/components/reserved-seat-map";
import {
  RESERVED_SEAT_DEFINITIONS,
  RESERVED_SEATING_VENUE,
  formatReservedSeatLabel,
  sortReservedSeatIds,
} from "@/lib/reserved-seating";
import type { ShowRecord, ShowReservedSeatAssignment, ShowReservedSeatingLink } from "@/lib/types";

type ReservedSeatSelectionPageProps = {
  show: Pick<ShowRecord, "name" | "show_date" | "venue" | "show_logo_url">;
  seatingLink: ShowReservedSeatingLink;
  assignments: ShowReservedSeatAssignment[];
};

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

export function ReservedSeatSelectionPage({ show, seatingLink, assignments }: ReservedSeatSelectionPageProps) {
  const [venuePhotoSrc, setVenuePhotoSrc] = useState(RESERVED_SEATING_VENUE.venuePhotoPath);
  const linkAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.seating_link_id === seatingLink.id),
    [assignments, seatingLink.id],
  );
  const submittedSeatIds = useMemo(
    () => sortReservedSeatIds(linkAssignments.map((assignment) => assignment.seat_id)),
    [linkAssignments],
  );
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>(submittedSeatIds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedSeatIds, setConfirmedSeatIds] = useState<string[]>(submittedSeatIds);
  const [hasSubmitted, setHasSubmitted] = useState(Boolean(seatingLink.submitted_at));
  const isAlreadySubmitted = hasSubmitted;

  const seatStates = useMemo<Record<string, ReservedSeatMapSeatState>>(() => {
    const assignmentBySeatId = new Map(assignments.map((assignment) => [assignment.seat_id, assignment]));
    const selectedSeatIdSet = new Set(selectedSeatIds);

    return Object.fromEntries(
      RESERVED_SEAT_DEFINITIONS.map((seat) => {
        const assignment = assignmentBySeatId.get(seat.seatId);
        const isOwnedByCurrentLink = assignment?.seating_link_id === seatingLink.id;
        const isBlocked = assignment?.assignment_type === "blocked";
        const isSelected = selectedSeatIdSet.has(seat.seatId);
        const disabled =
          isAlreadySubmitted ||
          (Boolean(assignment) && !isOwnedByCurrentLink) ||
          (!isSelected && selectedSeatIds.length >= seatingLink.ticket_count);
        const status: ReservedSeatMapSeatState["status"] = isSelected
          ? "selected"
          : isBlocked
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
            customerName: assignment?.customer_name ?? null,
            disabled,
          },
        ];
      }),
    ) as Record<string, ReservedSeatMapSeatState>;
  }, [assignments, isAlreadySubmitted, seatingLink.id, seatingLink.ticket_count, selectedSeatIds]);

  async function handleSubmit() {
    if (isAlreadySubmitted) {
      return;
    }

    if (selectedSeatIds.length === 0) {
      setErrorMessage("Select at least one seat before submitting.");
      return;
    }

    if (selectedSeatIds.length > seatingLink.ticket_count) {
      setErrorMessage(`You can only select up to ${seatingLink.ticket_count} seat${seatingLink.ticket_count === 1 ? "" : "s"}.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/reserved-seating/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: seatingLink.selection_token,
          seatIds: selectedSeatIds,
        }),
      });

      const payload = (await response.json()) as { success?: boolean; error?: string; data?: { seatIds?: string[] } };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to save reserved seats.");
      }

      const normalizedSeatIds = sortReservedSeatIds(payload.data?.seatIds ?? selectedSeatIds);
      setConfirmedSeatIds(normalizedSeatIds);
      setSelectedSeatIds(normalizedSeatIds);
      setHasSubmitted(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save reserved seats.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSeatClick(seatId: string) {
    if (isAlreadySubmitted) {
      return;
    }

    setErrorMessage(null);
    setSelectedSeatIds((currentSeatIds) => {
      if (currentSeatIds.includes(seatId)) {
        return currentSeatIds.filter((currentSeatId) => currentSeatId !== seatId);
      }

      if (currentSeatIds.length >= seatingLink.ticket_count) {
        return currentSeatIds;
      }

      return sortReservedSeatIds([...currentSeatIds, seatId]);
    });
  }

  const seatsToShow = isAlreadySubmitted ? confirmedSeatIds : selectedSeatIds;
  const showVenueName = show.venue?.trim() || RESERVED_SEATING_VENUE.venueName;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.12),_transparent_26%),linear-gradient(180deg,_#08111f,_#050913_58%,_#03060c)] px-4 py-6 text-slate-100 sm:px-6 sm:py-8">
      <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#08111f]/95 shadow-[0_24px_60px_rgba(2,6,23,0.45)]">
          <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_30%),linear-gradient(135deg,_#0a182a,_#091220_58%,_#040911)] px-4 py-5 text-white sm:px-6 lg:px-8 lg:py-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-center xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/30 shadow-[0_20px_40px_rgba(2,6,23,0.35)]">
                <img
                  src={venuePhotoSrc}
                  alt={RESERVED_SEATING_VENUE.venueName}
                  className="h-48 w-full object-cover sm:h-56"
                  onError={() => {
                    if (venuePhotoSrc !== RESERVED_SEATING_VENUE.venuePhotoFallbackPath) {
                      setVenuePhotoSrc(RESERVED_SEATING_VENUE.venuePhotoFallbackPath);
                    }
                  }}
                />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex rounded-full border border-emerald-300/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100">
                    Reserved Seating
                  </span>
                  <span className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200">
                    {formatShowDate(show.show_date)}
                  </span>
                </div>
                <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{show.name}</h1>
                <p className="mt-4 text-xl font-semibold text-white sm:text-2xl">{RESERVED_SEATING_VENUE.venueName}</p>
                <p className="mt-1 text-sm text-slate-200 sm:text-base">{RESERVED_SEATING_VENUE.venueAddress}</p>
                {showVenueName !== RESERVED_SEATING_VENUE.venueName ? (
                  <p className="mt-2 text-sm text-slate-300">Show venue record: {showVenueName}</p>
                ) : null}
                <p className="mt-4 max-w-3xl text-sm text-slate-200 sm:text-base">
                  Choose up to {seatingLink.ticket_count} seat{seatingLink.ticket_count === 1 ? "" : "s"} for <span className="font-semibold text-white">{seatingLink.customer_name}</span>. Your selected seats will stay highlighted if you return to this private link.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
            <ReservedSeatMap
              seatStates={seatStates}
              onSeatClick={handleSeatClick}
              title="Select Your Seats"
              helperText={
                isAlreadySubmitted
                  ? "Your seats are confirmed and highlighted in gold below the stage."
                  : "Available seats are green. Taken seats are red. Blocked seats are gray. Your current choices are highlighted in gold."
              }
            />

            <aside className="rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-white">Selection Summary</h2>
              <p className="mt-1 text-sm text-slate-300">
                {isAlreadySubmitted
                  ? "Your reserved seats are locked in."
                  : `You can select up to ${seatingLink.ticket_count} seat${seatingLink.ticket_count === 1 ? "" : "s"}.`}
              </p>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Customer</p>
                <p className="mt-2 text-base font-semibold text-white">{seatingLink.customer_name}</p>
                {seatingLink.email?.trim() ? <p className="mt-1 text-sm text-slate-300">{seatingLink.email}</p> : null}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Your Selected Seats</p>
                {seatsToShow.length > 0 ? (
                  <ul className="mt-3 grid gap-2">
                    {seatsToShow.map((seatId) => (
                      <li key={seatId} className="rounded-xl border border-amber-300/25 bg-amber-400/15 px-3 py-2 text-sm font-semibold text-amber-100">
                        {formatReservedSeatLabel(seatId)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">No seats selected yet.</p>
                )}
              </div>

              {errorMessage ? (
                <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {errorMessage}
                </div>
              ) : null}

              {!isAlreadySubmitted ? (
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={isSubmitting || selectedSeatIds.length === 0}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-900 disabled:text-emerald-300"
                >
                  {isSubmitting ? "Saving Seats..." : "Confirm Selected Seats"}
                </button>
              ) : (
                <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  Your reserved seats are confirmed.
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
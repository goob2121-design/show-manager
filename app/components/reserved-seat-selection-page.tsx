"use client";

import { useEffect, useMemo, useState } from "react";
import { PhoneTicketMode } from "@/app/components/phone-ticket-mode";
import { ReservationTicketCode } from "@/app/components/reservation-ticket-code";
import { ReservedSeatMap } from "@/app/components/reserved-seat-map";
import type { ReservedSeatMapSeatState } from "@/app/components/reserved-seat-map";
import {
  RESERVED_SEAT_DEFINITIONS,
  RESERVED_SEATING_VENUE,
  formatReservedSeatLabel,
  sortReservedSeatIds,
} from "@/lib/reserved-seating";
import type { ShowRecord, ShowReservedSeatAssignment, ShowReservedSeatingLink } from "@/lib/types";

type PublicSeatAssignment = Pick<ShowReservedSeatAssignment, "seat_id" | "seating_link_id" | "assignment_type">;

type ReservedSeatSelectionPageProps = {
  show: Pick<ShowRecord, "name" | "show_date" | "show_start_time" | "venue" | "show_logo_url" | "ticket_code_format">;
  seatingLink: ShowReservedSeatingLink;
  assignments: PublicSeatAssignment[];
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

function parseSeatDetails(seatId: string) {
  const match = /^(L|R)-([A-Z])(\d+)$/.exec(seatId);
  if (!match) {
    return {
      section: "",
      row: "",
      seatNumber: "",
    };
  }

  return {
    section: match[1] === "L" ? "Left Section" : "Right Section",
    row: match[2],
    seatNumber: match[3],
  };
}

export function ReservedSeatSelectionPage({ show, seatingLink, assignments }: ReservedSeatSelectionPageProps) {
  const [venuePhotoSrc, setVenuePhotoSrc] = useState<string>(RESERVED_SEATING_VENUE.venuePhotoPath);
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
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isResendingTicketEmail, setIsResendingTicketEmail] = useState(false);
  const [ticketEmailMessage, setTicketEmailMessage] = useState<string | null>(null);
  const [ticketEmailMessageTone, setTicketEmailMessageTone] = useState<"success" | "warning">("success");
  const [isPhoneTicketMode, setIsPhoneTicketMode] = useState(false);
  const [seatPreference, setSeatPreference] = useState(seatingLink.seat_preference ?? "customer_select");
  const [isSavingPreference, setIsSavingPreference] = useState(false);
  const isAlreadySubmitted = hasSubmitted;

  useEffect(() => {
    const syncPhoneMode = () => {
      const params = new URLSearchParams(window.location.search);
      setIsPhoneTicketMode(isAlreadySubmitted && params.get("phone") === "1");
    };
    const searchParams = new URLSearchParams(window.location.search);
    const phoneModeTimer = window.setTimeout(syncPhoneMode, 0);
    const printTimer = isAlreadySubmitted && searchParams.get("print") === "1"
      ? window.setTimeout(() => window.print(), 250)
      : null;
    window.addEventListener("popstate", syncPhoneMode);
    return () => {
      window.clearTimeout(phoneModeTimer);
      if (printTimer !== null) window.clearTimeout(printTimer);
      window.removeEventListener("popstate", syncPhoneMode);
    };
  }, [isAlreadySubmitted]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("preference") === "auto" && linkAssignments.length === 0 && !isAlreadySubmitted) {
      void saveSeatPreference("auto_assign");
    }
  // This one-time email-link action is intentionally keyed to the reservation loaded by the page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveSeatPreference(preference: "customer_select" | "auto_assign") {
    setIsSavingPreference(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/reserved-seating/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: seatingLink.selection_token, preference }),
      });
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to save your seat preference.");
      setSeatPreference(preference);
      if (preference === "customer_select") {
        const url = new URL(window.location.href);
        url.searchParams.delete("preference");
        window.history.replaceState({}, "", url);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save your seat preference.");
    } finally {
      setIsSavingPreference(false);
    }
  }
  function openPhoneTicket() {
    const url = new URL(window.location.href);
    url.searchParams.delete("print");
    url.searchParams.set("phone", "1");
    window.history.pushState({}, "", url);
    setShowSuccessModal(false);
    setIsPhoneTicketMode(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closePhoneTicket() {
    const url = new URL(window.location.href);
    url.searchParams.delete("phone");
    window.history.pushState({}, "", url);
    setIsPhoneTicketMode(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
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
            disabled,
          },
        ];
      }),
    ) as Record<string, ReservedSeatMapSeatState>;
  }, [assignments, isAlreadySubmitted, seatingLink.id, seatingLink.ticket_count, selectedSeatIds]);

  async function submitReservedSeats() {
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
    setShowSubmitConfirmation(false);

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

      const payload = (await response.json()) as { success?: boolean; error?: string; data?: { seatIds?: string[]; ticketEmailDelivered?: boolean; ticketEmailMessage?: string | null } };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to save reserved seats.");
      }

      const normalizedSeatIds = sortReservedSeatIds(payload.data?.seatIds ?? selectedSeatIds);
      setConfirmedSeatIds(normalizedSeatIds);
      setSelectedSeatIds(normalizedSeatIds);
      setHasSubmitted(true);
      setTicketEmailMessageTone(payload.data?.ticketEmailDelivered ? "success" : "warning");
      setTicketEmailMessage(payload.data?.ticketEmailDelivered
        ? "Your official ticket email is on its way."
        : payload.data?.ticketEmailMessage || "Your seats are confirmed, but the ticket email could not be delivered automatically.");
      setShowSuccessModal(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save reserved seats.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resendOfficialTicketEmail() {
    setIsResendingTicketEmail(true);
    setTicketEmailMessage(null);
    try {
      const response = await fetch("/api/reserved-seating/ticket-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: seatingLink.selection_token }),
      });
      const payload = await response.json() as { success?: boolean; error?: string; message?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to resend your ticket email.");
      setTicketEmailMessageTone("success");
      setTicketEmailMessage(payload.message || "Your official ticket email has been sent again.");
    } catch (error) {
      setTicketEmailMessageTone("warning");
      setTicketEmailMessage(error instanceof Error ? error.message : "Unable to resend your ticket email right now.");
    } finally {
      setIsResendingTicketEmail(false);
    }
  }
  function handleConfirmClick() {
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

    setErrorMessage(null);
    setShowSubmitConfirmation(true);
  }

  function handleSeatClick(seatId: string) {
    if (isAlreadySubmitted) {
      return;
    }

    setErrorMessage(null);
    setShowSubmitConfirmation(false);
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
  const formattedShowDate = formatShowDate(show.show_date);
  const ticketCoverageMessage = seatingLink.ticket_count === 1
    ? "One code covers the ticket in this reservation."
    : `One code covers all ${seatingLink.ticket_count} tickets in this reservation.`;

  if (seatPreference === "auto_assign" && linkAssignments.length === 0 && !isAlreadySubmitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#08111f,_#03060c)] px-4 py-10 text-slate-100">
        <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.05] p-6 text-center shadow-2xl sm:p-10">
          <p className="text-4xl" aria-hidden="true">🤝</p>
          <h1 className="mt-3 text-3xl font-black text-white">We&apos;ve Got It From Here!</h1>
          <p className="mt-5 leading-7 text-slate-200">Thanks! We&apos;ll choose the best available seats for your party, keep everyone together whenever possible, and email your tickets with your assigned seat numbers once they&apos;re ready.</p>
          <p className="mt-3 leading-7 text-slate-300">If you change your mind before your seats have been assigned, you can still return and choose your own seats.</p>
          {errorMessage ? <p className="mt-5 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</p> : null}
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => void saveSeatPreference("customer_select")} disabled={isSavingPreference} className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-[#071426] hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60">{isSavingPreference ? "Saving..." : "Choose My Own Seats Instead"}</button>
            <a href="https://www.cumberlandmountainmusic.com/show-dates" className="rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 font-semibold text-white hover:bg-white/[0.1]">Return</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="confirmation-print-root min-h-screen w-full max-w-full overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.12),_transparent_26%),linear-gradient(180deg,_#08111f,_#050913_58%,_#03060c)] px-4 py-6 pb-28 text-slate-100 sm:px-6 sm:py-8 sm:pb-8">
      <style jsx global>{`
        @page {
          size: Letter portrait;
          margin: 0.2in;
        }

        @media print {
          html,
          body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
          }

          body {
            margin: 0 !important;
          }

          .confirmation-print-root {
            min-height: 0 !important;
            height: auto !important;
            overflow: visible !important;
            background: #ffffff !important;
            padding: 0 !important;
          }

          .seat-confirmation-screen {
            display: none !important;
          }

          .seat-confirmation-print {
            display: block !important;
            position: static !important;
            width: auto !important;
            background: #ffffff !important;
            color: #111111 !important;
            padding: 0;
            margin: 0;
            break-after: auto !important;
            page-break-after: auto !important;
          }

          .seat-confirmation-print .ticket-code-block {
            break-inside: auto !important;
            page-break-inside: auto !important;
          }
          .ticket-print-sheet {
            box-sizing: border-box !important;
            width: 100% !important;
            max-width: 7.8in !important;
            margin: 0 auto !important;
            padding: 0.12in 0.18in !important;
            break-inside: auto !important;
            page-break-inside: auto !important;
          }

          .ticket-print-header {
            padding-bottom: 0.1in !important;
          }

          .ticket-print-details,
          .ticket-print-seats,
          .ticket-print-code {
            margin-top: 0.12in !important;
          }

          .ticket-print-seats > div {
            margin-top: 0.06in !important;
            gap: 0.05in !important;
          }

          .ticket-print-seat {
            padding: 0.06in 0.1in !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .ticket-print-code .ticket-code-block {
            padding: 0.08in !important;
          }


          .ticket-print-details {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.12in !important;
          }

          .ticket-print-seats > div {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .ticket-print-code .ticket-code-intro {
            gap: 0.02in !important;
          }

          .ticket-print-code .ticket-code-grid {
            align-items: center !important;
            gap: 0.08in !important;
            margin-top: 0.06in !important;
          }

          .ticket-print-code .ticket-code-grid-both {
            grid-template-columns: 1.5in minmax(0, 1fr) !important;
          }

          .ticket-print-code .ticket-code-grid-qr,
          .ticket-print-code .ticket-code-grid-code128 {
            grid-template-columns: minmax(0, 1fr) !important;
            justify-items: center !important;
          }

          .ticket-print-code .ticket-code-surface {
            box-sizing: border-box !important;
            width: 100% !important;
            padding: 0.05in !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .ticket-print-code .ticket-code-grid-qr .ticket-code-surface {
            max-width: 1.65in !important;
          }

          .ticket-print-code .ticket-code-grid-code128 .ticket-code-surface {
            max-width: 4.1in !important;
          }

          .ticket-print-code img[alt="Reservation QR code"] {
            width: 1.4in !important;
            max-width: 1.4in !important;
            max-height: 1.4in !important;
          }

          .ticket-print-code img[alt="Reservation barcode"] {
            width: 3.8in !important;
            max-width: 100% !important;
            max-height: 1in !important;
          }

          .ticket-print-code img[alt="Reservation QR code"] + p {
            margin-top: 0.02in !important;
          }

          .ticket-print-code .ticket-code-meta {
            gap: 0.02in !important;
            margin-top: 0.06in !important;
            padding: 0.06in 0.08in !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .ticket-print-footer {
            margin-top: 0.08in !important;
          }
        }
      `}</style>

      <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 overflow-x-hidden">
        {isPhoneTicketMode && isAlreadySubmitted ? (
          <PhoneTicketMode
            guestName={seatingLink.customer_name}
            eventName={show.name}
            showDate={formattedShowDate}
            showTime={show.show_start_time}
            venueName={showVenueName}
            seatLabels={confirmedSeatIds.map((seatId) => formatReservedSeatLabel(seatId))}
            ticketCount={seatingLink.ticket_count}
            scanToken={seatingLink.scan_token}
            ticketCodeFormat={show.ticket_code_format}
            onBack={closePhoneTicket}
          />
        ) : null}
        <div className={`seat-confirmation-screen ${isPhoneTicketMode ? "hidden" : ""}`}>
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#08111f]/95 shadow-[0_24px_60px_rgba(2,6,23,0.45)]">
          <div className="relative border-b border-white/10 px-4 py-5 text-white sm:px-6 lg:px-8 lg:py-6">
            <img
              src="/cmms-header.png"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(10,24,42,0.78),rgba(9,18,32,0.72)_58%,rgba(4,9,17,0.86)),radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_22%)]" />
            <div className="relative grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-center xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/30 shadow-[0_20px_40px_rgba(2,6,23,0.35)]">
                <img
                  src={venuePhotoSrc}
                  alt={RESERVED_SEATING_VENUE.venueName}
                  className="h-56 w-full object-cover sm:h-64"
                  onError={() => {
                    if (venuePhotoSrc !== RESERVED_SEATING_VENUE.venuePhotoFallbackPath) {
                      setVenuePhotoSrc(RESERVED_SEATING_VENUE.venuePhotoFallbackPath);
                    }
                  }}
                />
              </div>
              <div className="relative">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex rounded-full border border-emerald-300/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100">
                    Reserved Seating
                  </span>
                  <span className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200">
                    {formattedShowDate}
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

          <div className="grid w-full max-w-full gap-6 overflow-x-hidden px-4 py-6 sm:px-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
            <aside className="order-1 rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-4 sm:p-5 xl:order-2 xl:sticky xl:top-6">
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

              <div className="mt-4">
                <ReservationTicketCode
                  scanToken={seatingLink.scan_token}
                  format={show.ticket_code_format}
                  purchaserName={seatingLink.customer_name}
                  ticketCount={seatingLink.ticket_count}
                  seatLabels={seatsToShow.map((seatId) => formatReservedSeatLabel(seatId))}
                  compact
                  interactive
                />
              </div>

              {errorMessage ? (
                <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {errorMessage}
                </div>
              ) : null}

              {!isAlreadySubmitted ? (
                <button
                  type="button"
                  onClick={handleConfirmClick}
                  disabled={isSubmitting || selectedSeatIds.length === 0}
                  className="mt-4 hidden w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-900 disabled:text-emerald-300 sm:inline-flex"
                >
                  {isSubmitting ? "Saving Seats..." : "Review And Confirm Seats"}
                </button>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    <p className="font-bold">Your tickets are ready.</p>
                    <p className="mt-2 leading-6">Most guests simply use their phone at the door. Open the Phone-Friendly Ticket below and present the code when you arrive.</p>
                    <p className="mt-2 leading-6">You may also print your ticket or email it to yourself again.</p>
                    <p className="mt-2 font-semibold">{ticketCoverageMessage}</p>
                  </div>

                  <button
                    type="button"
                    onClick={openPhoneTicket}
                    aria-label="Open Phone-Friendly Ticket"
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-[#071426] shadow-lg shadow-amber-950/20 transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08111f]"
                  >
                    📱 Open Phone-Friendly Ticket
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    🖨️ Print Ticket
                  </button>
                  <button
                    type="button"
                    onClick={() => void resendOfficialTicketEmail()}
                    disabled={isResendingTicketEmail || !seatingLink.email?.trim()}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isResendingTicketEmail ? "Sending..." : "✉️ Email Ticket Again"}
                  </button>
                  {ticketEmailMessage ? (
                    <p className={`rounded-xl border px-3 py-2 text-sm ${ticketEmailMessageTone === "success" ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : "border-amber-300/25 bg-amber-400/10 text-amber-100"}`}>
                      {ticketEmailMessage}
                    </p>
                  ) : null}
                </div>
              )}
            </aside>

            <div className="order-2 w-full max-w-full overflow-hidden xl:order-1">
              {!isAlreadySubmitted && linkAssignments.length === 0 ? (
                <section className="mb-4 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-center">
                  <h2 className="text-xl font-bold text-white">Need a little help choosing your seats?</h2>
                  <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-300">If you&apos;d rather not choose your seats online, we&apos;re happy to take care of it for you.</p>
                  <p className="mx-auto mt-2 max-w-3xl text-sm leading-6 text-slate-300">Your advance ticket purchase already guarantees your reserved seats. We&apos;ll choose the best available seats for your party, keep everyone together whenever possible, and email your tickets with your assigned seat numbers—so all you have to do is show up and enjoy the show!</p>
                  <button type="button" onClick={() => void saveSeatPreference("auto_assign")} disabled={isSavingPreference} className="mt-4 rounded-xl bg-amber-400 px-4 py-2.5 font-bold text-[#071426] hover:bg-amber-300 disabled:opacity-60">{isSavingPreference ? "Saving..." : "🎟️ Choose My Seats for Me"}</button>
                </section>
              ) : null}
              <ReservedSeatMap
                seatStates={seatStates}
                onSeatClick={handleSeatClick}
                showCustomerSeatDetails={false}
                title="Select Your Seats"
                helperText={
                  isAlreadySubmitted
                    ? "Your seats are confirmed and highlighted in gold below the stage."
                    : "Available seats are green. Taken seats are red. Blocked seats are gray. Your current choices are highlighted in gold."
                }
              />
            </div>
          </div>
        </div>

        {showSubmitConfirmation ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,_#0c1728,_#060d18)] p-5 text-slate-100 shadow-[0_24px_60px_rgba(2,6,23,0.55)] sm:p-6">
              <div className="flex flex-col gap-3">
                <span className="inline-flex w-fit rounded-full border border-amber-300/25 bg-amber-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-100">
                  Confirm Reserved Seats
                </span>
                <h2 className="text-2xl font-black tracking-tight text-white">Are you sure you want to reserve these seats?</h2>
                <p className="text-sm text-slate-300">Once confirmed, these seats will be reserved for you.</p>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Customer</p>
                <p className="mt-2 text-base font-semibold text-white">{seatingLink.customer_name}</p>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Selected Seats</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedSeatIds.map((seatId) => (
                    <span key={seatId} className="rounded-full border border-amber-300/25 bg-amber-400/15 px-3 py-1 text-sm font-semibold text-amber-100">
                      {formatReservedSeatLabel(seatId)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirmation(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitReservedSeats()}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-900 disabled:text-emerald-300"
                >
                  {isSubmitting ? "Saving Seats..." : "Yes, Reserve These Seats"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showSuccessModal ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,_#0c1728,_#060d18)] p-5 text-slate-100 shadow-[0_24px_60px_rgba(2,6,23,0.55)] sm:p-6">
              <div className="flex flex-col gap-3">
                <span className="inline-flex w-fit rounded-full border border-emerald-300/25 bg-emerald-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
                  Reserved Seating Confirmed
                </span>
                <h2 className="text-2xl font-black tracking-tight text-white">Your tickets are ready.</h2>
                <p className="text-sm leading-6 text-slate-300">Most guests simply use their phone at the door. Open the Phone-Friendly Ticket below and present the code when you arrive.</p>
                <p className="text-sm leading-6 text-slate-300">You may also print your ticket or email it to yourself again.</p>
                <p className="text-sm font-semibold text-amber-100">{ticketCoverageMessage}</p>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Customer</p>
                <p className="mt-2 text-base font-semibold text-white">{seatingLink.customer_name}</p>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Selected Seats</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {confirmedSeatIds.map((seatId) => (
                    <span key={seatId} className="rounded-full border border-amber-300/25 bg-amber-400/15 px-3 py-1 text-sm font-semibold text-amber-100">
                      {formatReservedSeatLabel(seatId)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Venue</p>
                <p className="mt-2 text-base font-semibold text-white">{RESERVED_SEATING_VENUE.venueName}</p>
                <p className="mt-1 text-sm text-slate-300">{RESERVED_SEATING_VENUE.venueAddress}</p>
              </div>

              {ticketEmailMessage ? (
                <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${ticketEmailMessageTone === "success" ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : "border-amber-300/25 bg-amber-400/10 text-amber-100"}`}>
                  {ticketEmailMessage}
                </div>
              ) : null}
              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  onClick={openPhoneTicket}
                  aria-label="Open Phone-Friendly Ticket"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-[#071426] shadow-lg shadow-amber-950/20 transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08111f]"
                >
                  📱 Open Phone-Friendly Ticket
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  🖨️ Print Ticket
                </button>
                <button
                  type="button"
                  onClick={() => void resendOfficialTicketEmail()}
                  disabled={isResendingTicketEmail || !seatingLink.email?.trim()}
                  className="inline-flex items-center justify-center rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isResendingTicketEmail ? "Sending..." : "✉️ Email Ticket Again"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSuccessModal(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  🌐 View Standard Ticket
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!isAlreadySubmitted ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#08111f]/95 px-4 py-3 backdrop-blur sm:hidden">
            <button
              type="button"
              onClick={handleConfirmClick}
              disabled={isSubmitting || selectedSeatIds.length === 0}
              className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-900 disabled:text-emerald-300"
            >
              {selectedSeatIds.length === 0
                ? "Select Seats To Continue"
                : isSubmitting
                  ? "Saving Seats..."
                  : `Review ${selectedSeatIds.length} Selected Seat${selectedSeatIds.length === 1 ? "" : "s"}`}
            </button>
          </div>
        ) : null}
        </div>

        {confirmedSeatIds.length > 0 ? (
          <section className="seat-confirmation-print hidden print:block">
            <div className="ticket-print-sheet mx-auto max-w-3xl px-8 py-10 text-black">
              <div className="ticket-print-header border-b-2 border-black pb-4">
                <h1 className="text-3xl font-bold">Cumberland Mountain Music Show</h1>
                <p className="mt-2 text-lg font-semibold">{RESERVED_SEATING_VENUE.venueName}</p>
                <p className="text-sm">{RESERVED_SEATING_VENUE.venueAddress}</p>
                <p className="mt-3 text-xl font-semibold">Reserved Seat Confirmation</p>
              </div>

              <div className="ticket-print-details mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em]">Customer</p>
                  <p className="mt-1 text-lg">{seatingLink.customer_name}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em]">Show Date</p>
                  <p className="mt-1 text-lg">{formattedShowDate}</p>
                </div>
              </div>

              <div className="ticket-print-seats mt-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em]">Selected Seats</p>
                <div className="mt-3 space-y-3">
                  {confirmedSeatIds.map((seatId) => {
                    const details = parseSeatDetails(seatId);
                    return (
                      <div key={seatId} className="ticket-print-seat rounded-xl border border-black px-4 py-3">
                        <p className="text-lg font-semibold">{formatReservedSeatLabel(seatId)}</p>
                        <p className="mt-1 text-sm">
                          {details.section ? `${details.section} - Row ${details.row} - Seat ${details.seatNumber}` : seatId}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="ticket-print-code mt-6">
                <ReservationTicketCode
                  scanToken={seatingLink.scan_token}
                  format={show.ticket_code_format}
                  purchaserName={seatingLink.customer_name}
                  ticketCount={seatingLink.ticket_count}
                  seatLabels={confirmedSeatIds.map((seatId) => formatReservedSeatLabel(seatId))}
                  printable
                />
              </div>

              <p className="ticket-print-footer mt-8 text-sm">
                Please bring this confirmation or give your name at the door.
              </p>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

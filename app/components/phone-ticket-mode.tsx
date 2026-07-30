"use client";

import { useEffect, useState } from "react";
import { ReservationTicketCode } from "@/app/components/reservation-ticket-code";

type PhoneTicketModeProps = {
  guestName: string;
  eventName: string;
  showDate: string;
  showTime: string | null;
  venueName: string;
  seatLabels: string[];
  ticketCount: number;
  scanToken: string | null;
  ticketCodeFormat: string | null;
  onBack: () => void;
};

export function PhoneTicketMode({
  guestName,
  eventName,
  showDate,
  showTime,
  venueName,
  seatLabels,
  ticketCount,
  scanToken,
  ticketCodeFormat,
  onBack,
}: PhoneTicketModeProps) {
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const supportTimer = window.setTimeout(() => {
      setCanFullscreen(typeof document.documentElement.requestFullscreen === "function");
    }, 0);
    const updateFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => {
      window.clearTimeout(supportTimer);
      document.removeEventListener("fullscreenchange", updateFullscreen);
    };
  }, []);

  async function toggleFullscreen() {
    if (!canFullscreen) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen can be denied by browser or device policy; the ticket remains fully usable.
    }
  }

  const detailRows = [
    ["Guest", guestName],
    ["Event", eventName],
    ["Date", showDate],
    ...(showTime?.trim() ? [["Time", showTime.trim()]] : []),
    ["Venue", venueName],
    ["Seats", seatLabels.join(", ")],
    ["Ticket Quantity", String(ticketCount)],
  ];

  return (
    <div className="seat-confirmation-screen min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(217,155,43,0.16),_transparent_28%),linear-gradient(180deg,_#071426,_#030711)] px-3 py-4 text-white sm:px-5 sm:py-6">
      <section className="mx-auto w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#091728] shadow-[0_24px_70px_rgba(0,0,0,0.48)]">
        <header className="border-b border-amber-300/20 bg-[linear-gradient(135deg,_#0d2a45,_#071426)] px-5 py-5 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-300">Phone Ticket</p>
          <h1 className="mt-2 text-2xl font-black leading-tight text-white">Cumberland Mountain Music Show</h1>
        </header>

        <div className="space-y-4 p-4 sm:p-5">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm">
            {detailRows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="font-semibold text-slate-400">{label}</dt>
                <dd className="min-w-0 text-right font-semibold text-slate-100">{value || "—"}</dd>
              </div>
            ))}
          </dl>

          <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-center">
            <p className="font-bold text-amber-100">
              {ticketCount === 1
                ? "One code covers the ticket in this reservation."
                : `One code covers all ${ticketCount} tickets in this reservation.`}
            </p>
            <p className="mt-1 text-sm text-amber-50">For best scanning, turn your screen brightness up.</p>
          </div>

          <ReservationTicketCode
            scanToken={scanToken}
            format={ticketCodeFormat}
            phone
          />

          <p className="text-center text-sm leading-6 text-slate-300">
            For faster entry you may take a screenshot of this ticket for quick access at the door.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white hover:bg-white/[0.1]"
            >
              Back to Ticket
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-[#071426] hover:bg-amber-300"
            >
              Print Ticket
            </button>
            {canFullscreen ? (
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/20 sm:col-span-2"
                aria-label={isFullscreen ? "Exit full screen phone ticket" : "Open phone ticket full screen"}
              >
                {isFullscreen ? "Exit Full Screen" : "Full Screen"}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { buildReservationTicketCodeDisplay } from "@/lib/reservation-ticket-code-display";

type ReservationTicketCodeProps = {
  scanToken: string | null | undefined;
  format?: "qr" | "code128" | "both" | string | null;
  purchaserName?: string | null;
  ticketCount?: number | null;
  seatLabels?: string[];
  compact?: boolean;
  printable?: boolean;
  phone?: boolean;
  interactive?: boolean;
};

type EnlargedCode = {
  src: string;
  alt: string;
  label: string;
  kind: "qr" | "code128";
};

export function ReservationTicketCode({
  scanToken,
  format,
  purchaserName,
  ticketCount,
  seatLabels = [],
  compact = false,
  printable = false,
  phone = false,
  interactive = false,
}: ReservationTicketCodeProps) {
  const display = buildReservationTicketCodeDisplay(scanToken, format);
  const [enlargedCode, setEnlargedCode] = useState<EnlargedCode | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const canEnlarge = interactive && !phone && !printable;

  useEffect(() => {
    if (!enlargedCode) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEnlargedCode(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enlargedCode]);

  if (!display) {
    return null;
  }

  const wrapperClassName = phone
    ? "rounded-2xl border border-white/10 bg-white/[0.04] p-3"
    : compact
      ? "rounded-2xl border border-white/10 bg-white/[0.04] p-3"
      : "rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5";
  const surfaceClassName = printable
    ? "rounded-2xl border border-stone-300 bg-white p-3 text-center"
    : "rounded-2xl border border-white/10 bg-white p-3 text-center text-slate-950";
  const metaTextClassName = printable ? "text-stone-700" : canEnlarge ? "text-slate-100" : "text-slate-700";
  const headingClassName = printable ? "text-stone-900" : "text-white";
  const codeGridClassName = canEnlarge
    ? "grid-cols-1 justify-items-center"
    : display.format === "both" && !phone
      ? "md:grid-cols-2"
      : "grid-cols-1";

  function enlargeCode(code: EnlargedCode) {
    if (canEnlarge) setEnlargedCode(code);
  }

  return (
    <>
      <section className={`ticket-code-block ${wrapperClassName}`}>
        <div className="ticket-code-intro flex flex-col gap-2">
          <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${printable ? "text-stone-600" : "text-emerald-200"}`}>
            Your Entry Code
          </p>
          <p className={`text-sm ${printable ? "text-stone-700" : "text-slate-300"}`}>
            Present this code at the entrance.
          </p>
        </div>

        <div className={`ticket-code-grid mt-4 grid ${canEnlarge ? "gap-4" : "gap-3"} ${codeGridClassName} ${printable ? `ticket-code-grid-${display.format}` : ""}`}>
          {display.qrDataUri ? (
            <div className={`ticket-code-surface ${surfaceClassName}`}>
              {canEnlarge ? (
                <button
                  type="button"
                  onClick={() => enlargeCode({ src: display.qrDataUri!, alt: "Enlarged reservation QR code", label: "QR Code", kind: "qr" })}
                  aria-label="Enlarge reservation QR code"
                  className="mx-auto flex w-full cursor-zoom-in flex-col items-center rounded-xl p-1 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
                >
                  <img
                    src={display.qrDataUri}
                    alt="Reservation QR code"
                    className="h-auto w-full max-w-[220px] object-contain"
                  />
                  <span className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">QR Code · Tap to enlarge</span>
                </button>
              ) : (
                <>
                  <img
                    src={display.qrDataUri}
                    alt="Reservation QR code"
                    className={`mx-auto h-auto w-full object-contain ${phone ? "max-h-[300px] max-w-[300px]" : compact ? "max-h-[180px] max-w-[220px]" : "max-h-[220px] max-w-[220px]"} ${printable ? "print:max-w-[150px]" : ""}`}
                  />
                  <p className={`mt-2 text-xs font-semibold uppercase tracking-[0.18em] ${metaTextClassName}`}>
                    QR Code
                  </p>
                </>
              )}
            </div>
          ) : null}

          {display.code128DataUri ? (
            <div className={`ticket-code-surface ${surfaceClassName}`}>
              {canEnlarge ? (
                <button
                  type="button"
                  onClick={() => enlargeCode({ src: display.code128DataUri!, alt: "Enlarged reservation barcode", label: "Code128 Barcode", kind: "code128" })}
                  aria-label="Enlarge reservation barcode"
                  className="mx-auto flex w-full cursor-zoom-in flex-col items-center rounded-xl p-1 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
                >
                  <img
                    src={display.code128DataUri}
                    alt="Reservation barcode"
                    className="h-auto w-full max-w-[420px] object-contain"
                  />
                  <span className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">Barcode · Tap to enlarge</span>
                </button>
              ) : (
                <img
                  src={display.code128DataUri}
                  alt="Reservation barcode"
                  className={`mx-auto h-auto w-full object-contain ${phone ? "max-h-[180px] max-w-[460px]" : compact ? "max-h-[100px] max-w-[320px]" : "max-h-[120px] max-w-[320px]"} ${printable ? "print:max-w-[260px]" : ""}`}
                />
              )}
            </div>
          ) : null}
        </div>

        {purchaserName || ticketCount || seatLabels.length ? (
          <div className={`ticket-code-meta mt-4 grid gap-2 rounded-2xl border ${printable ? "border-stone-300 bg-stone-50" : canEnlarge ? "border-white/15 bg-slate-950/55" : "border-white/10 bg-white/[0.03]"} p-3`}>
            {purchaserName ? (
              <p className={`${canEnlarge ? "text-base leading-6" : "text-sm"} ${metaTextClassName}`}>
                <span className={`font-semibold ${headingClassName}`}>Ticket holder:</span> {purchaserName}
              </p>
            ) : null}
            {ticketCount ? (
              <p className={`${canEnlarge ? "text-base leading-6" : "text-sm"} ${metaTextClassName}`}>
                <span className={`font-semibold ${headingClassName}`}>Tickets:</span> {ticketCount}
              </p>
            ) : null}
            {seatLabels.length ? (
              <p className={`${canEnlarge ? "break-words text-base leading-6" : "text-sm"} ${metaTextClassName}`}>
                <span className={`font-semibold ${headingClassName}`}>Seats:</span> {seatLabels.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {enlargedCode ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="enlarged-ticket-code-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEnlargedCode(null);
          }}
        >
          <div className="w-full max-w-4xl rounded-3xl border border-white/15 bg-white p-4 text-center shadow-2xl sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 id="enlarged-ticket-code-title" className="text-lg font-bold text-slate-950">
                {enlargedCode.label}
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setEnlargedCode(null)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
              >
                Close
              </button>
            </div>
            <div className="mt-5 flex min-h-[260px] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 sm:p-6">
              <img
                src={enlargedCode.src}
                alt={enlargedCode.alt}
                className={enlargedCode.kind === "qr"
                  ? "h-auto w-full max-w-[min(72vw,440px)] object-contain"
                  : "h-auto w-full max-w-[min(86vw,760px)] object-contain"}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
import { buildReservationTicketCodeDisplay } from "@/lib/reservation-ticket-code-display";

type ReservationTicketCodeProps = {
  scanToken: string | null | undefined;
  format?: "qr" | "code128" | "both" | string | null;
  purchaserName?: string | null;
  ticketCount?: number | null;
  seatLabels?: string[];
  compact?: boolean;
  printable?: boolean;
};

export function ReservationTicketCode({
  scanToken,
  format,
  purchaserName,
  ticketCount,
  seatLabels = [],
  compact = false,
  printable = false,
}: ReservationTicketCodeProps) {
  const display = buildReservationTicketCodeDisplay(scanToken, format);

  if (!display) {
    return null;
  }

  const wrapperClassName = compact
    ? "rounded-2xl border border-white/10 bg-white/[0.04] p-3"
    : "rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5";
  const surfaceClassName = printable
    ? "rounded-2xl border border-stone-300 bg-white p-3 text-center"
    : "rounded-2xl border border-white/10 bg-white p-3 text-center text-slate-950";
  const metaTextClassName = printable ? "text-stone-700" : "text-slate-700";
  const headingClassName = printable ? "text-stone-900" : "text-white";

  return (
    <section className={`ticket-code-block ${wrapperClassName}`}>
      <div className="flex flex-col gap-2">
        <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${printable ? "text-stone-600" : "text-emerald-200"}`}>
          Your Entry Code
        </p>
        <p className={`text-sm ${printable ? "text-stone-700" : "text-slate-300"}`}>
          Present this code at the entrance.
        </p>
      </div>

      <div className={`mt-4 grid gap-3 ${display.format === "both" ? "md:grid-cols-2" : ""}`}>
        {display.qrDataUri ? (
          <div className={surfaceClassName}>
            <img
              src={display.qrDataUri}
              alt="Reservation QR code"
              className={`mx-auto h-auto w-full max-w-[220px] object-contain ${compact ? "max-h-[180px]" : "max-h-[220px]"} ${printable ? "print:max-w-[150px]" : ""}`}
            />
            <p className={`mt-2 text-xs font-semibold uppercase tracking-[0.18em] ${metaTextClassName}`}>
              QR Code
            </p>
          </div>
        ) : null}

        {display.code128DataUri ? (
          <div className={surfaceClassName}>
            <img
              src={display.code128DataUri}
              alt="Reservation barcode"
              className={`mx-auto h-auto w-full max-w-[320px] object-contain ${compact ? "max-h-[100px]" : "max-h-[120px]"} ${printable ? "print:max-w-[260px]" : ""}`}
            />
            <p className={`mt-2 text-xs font-semibold uppercase tracking-[0.18em] ${metaTextClassName}`}>
              Ticket Code: {display.shortReference}
            </p>
          </div>
        ) : null}
      </div>

      {purchaserName || ticketCount || seatLabels.length ? (
        <div className={`mt-4 grid gap-2 rounded-2xl border ${printable ? "border-stone-300 bg-stone-50" : "border-white/10 bg-white/[0.03]"} p-3`}>
          {purchaserName ? (
            <p className={`text-sm ${metaTextClassName}`}>
              <span className={`font-semibold ${headingClassName}`}>Ticket holder:</span> {purchaserName}
            </p>
          ) : null}
          {ticketCount ? (
            <p className={`text-sm ${metaTextClassName}`}>
              <span className={`font-semibold ${headingClassName}`}>Tickets:</span> {ticketCount}
            </p>
          ) : null}
          {seatLabels.length ? (
            <p className={`text-sm ${metaTextClassName}`}>
              <span className={`font-semibold ${headingClassName}`}>Seats:</span> {seatLabels.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

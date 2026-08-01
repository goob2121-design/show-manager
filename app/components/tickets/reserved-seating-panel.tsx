import Link from "next/link";

export type TicketReservedSeatingPanelProps = {
  showSlug: string;
  isReservedSeatingOpen: boolean;
  copiedPublicSeatAvailabilityLink: boolean;
  publicSeatAvailabilityUrl: string;
  genericPublicSeatAvailabilityUrl: string;
  onToggleReservedSeating: () => void;
  onOpenPublicSeatAvailabilityPage: () => void;
  onCopyPublicSeatAvailabilityLink: () => void;
  onPrintCompList: () => void;
  onExportCompListPdf: () => void;
};

export function TicketReservedSeatingPanel({
  showSlug,
  isReservedSeatingOpen,
  copiedPublicSeatAvailabilityLink,
  publicSeatAvailabilityUrl,
  genericPublicSeatAvailabilityUrl,
  onToggleReservedSeating,
  onOpenPublicSeatAvailabilityPage,
  onCopyPublicSeatAvailabilityLink,
  onPrintCompList,
  onExportCompListPdf,
}: TicketReservedSeatingPanelProps) {
  return (
    <>
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4">
          <div>
            <h3 className="text-base font-semibold text-stone-900">Reserved Seating</h3>
            <p className="text-sm text-stone-600">Manage reserved seating, public availability, and seat card printing from one place.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              onClick={onToggleReservedSeating}
              className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition ${
                isReservedSeatingOpen
                  ? "border border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                  : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
              }`}
            >
              {isReservedSeatingOpen ? "Hide Reserved Seating" : "Open Reserved Seating"}
            </button>
            <button
              type="button"
              onClick={onOpenPublicSeatAvailabilityPage}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Open Public Availability
            </button>
            <button
              type="button"
              onClick={onCopyPublicSeatAvailabilityLink}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              {copiedPublicSeatAvailabilityLink ? "Availability Link Copied" : "Copy Availability Link"}
            </button>
            <Link
              href={`/admin/${showSlug}/print/comp-reserved-seat-cards`}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Print Comp Reserved Seat Cards
            </Link>
            <Link
              href={`/admin/${showSlug}/print/blank-seat-cards`}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Print Back-Up / Blank Seat Cards
            </Link>
            <button
              type="button"
              onClick={onPrintCompList}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Print Comp List
            </button>
            <button
              type="button"
              onClick={onExportCompListPdf}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              Export Comp List PDF
            </button>
          </div>
          <p className="sr-only">
            Public availability URL: {publicSeatAvailabilityUrl}. Generic fallback: {genericPublicSeatAvailabilityUrl}.
          </p>
        </div>
      </div>

    </>
  );
}

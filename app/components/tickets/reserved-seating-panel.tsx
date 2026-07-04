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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
              Public Seat Availability
            </button>
            <button
              type="button"
              onClick={onCopyPublicSeatAvailabilityLink}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              {copiedPublicSeatAvailabilityLink ? "Copied Public Link" : "Copy Public Seat Availability Link"}
            </button>
            <Link
              href={`/admin/${showSlug}/print/reserved-seat-cards`}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Print Reserved Seat Cards
            </Link>
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
        </div>
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        Online orders are automatically added to Reserved Seating. Print assigned seat cards from Reserved Seating after seats are selected. Use the paid online fallback print option only for orders that still need generic reserved cards.
      </div>

      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-stone-900">Public Seat Availability</h3>
            <p className="mt-1 text-sm text-stone-600">
              Allow customers to view current seat availability before purchasing tickets.
            </p>
            <p className="mt-3 break-all rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700">
              {publicSeatAvailabilityUrl}
            </p>
            <p className="mt-2 text-xs text-stone-500">
              Generic fallback: {genericPublicSeatAvailabilityUrl}
            </p>
            {copiedPublicSeatAvailabilityLink ? (
              <p className="mt-2 text-sm font-medium text-emerald-700">Link copied.</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
            <button
              type="button"
              onClick={onOpenPublicSeatAvailabilityPage}
              className="inline-flex items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Open Availability Page
            </button>
            <button
              type="button"
              onClick={onCopyPublicSeatAvailabilityLink}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              {copiedPublicSeatAvailabilityLink ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
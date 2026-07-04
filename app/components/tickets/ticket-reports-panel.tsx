import Link from "next/link";

export type TicketReportsPanelProps = {
  showSlug: string;
  onPrintCompList: () => void;
  onExportCompListPdf: () => void;
};

export function TicketReportsPanel({ showSlug, onPrintCompList, onExportCompListPdf }: TicketReportsPanelProps) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid gap-4">
        <div>
          <h3 className="text-base font-semibold text-stone-900">Reports &amp; Printouts</h3>
          <p className="text-sm text-stone-600">Print front-door lists and backup sheets without digging through operational controls.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Link
            href={`/admin/${showSlug}/print/door-guest-list`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            Print Door Count List
          </Link>
          <Link
            href={`/admin/${showSlug}/print/blank-seat-cards`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            Print Back-Up / Guest List Cards
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
  );
}
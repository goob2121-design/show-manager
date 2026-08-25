import Link from "next/link";
import type { ReactNode } from "react";
import { AdmissionsSyncPreviewPanel } from "@/app/components/tickets/admissions-sync-preview-panel";
import type { PrepareCheckInListResult } from "@/lib/prepare-check-in-list";

// Emergency fallback importer remains implemented but is hidden from the normal automatic-Square workflow.
export const SHOW_LEGACY_PAID_ORDER_IMPORT = false;

export type TicketSalesPanelProps = {
  showId: string;
  showSlug: string;
  isTicketImportOpen: boolean;
  isManualTicketFormOpen: boolean;
  isTotalsOpen: boolean;
  totalsContent: ReactNode;
  onToggleTicketImport: () => void;
  onToggleManualTicketForm: () => void;
  onToggleTotals: () => void;
  onCheckInListPrepared?: (result: PrepareCheckInListResult) => void | Promise<void>;
};

export function TicketSalesPanel({
  showId,
  showSlug,
  isTicketImportOpen,
  isManualTicketFormOpen,
  isTotalsOpen,
  totalsContent,
  onToggleTicketImport,
  onToggleManualTicketForm,
  onToggleTotals,
  onCheckInListPrepared,
}: TicketSalesPanelProps) {
  return (
    <div className="grid gap-4">
      <AdmissionsSyncPreviewPanel
        showId={showId}
        showSlug={showSlug}
        onPrepared={onCheckInListPrepared}
        headerActions={
          <>
        {SHOW_LEGACY_PAID_ORDER_IMPORT ? (
          <button
            type="button"
            onClick={onToggleTicketImport}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            {isTicketImportOpen ? "Hide Import Paid Online Orders" : "Import Paid Online Orders"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggleManualTicketForm}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
        >
          {isManualTicketFormOpen ? "Hide Manual / Complimentary Ticket" : "Add Manual / Complimentary Ticket"}
        </button>
        <Link
          href={`/admin/${showSlug}/door`}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
        >
          Open Door Mode / Door Check-In
        </Link>
            <Link
              href={`/admin/${encodeURIComponent(showSlug)}/square-integration`}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              Square Integration
            </Link>
            <button
              type="button"
              onClick={onToggleTotals}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              {isTotalsOpen ? "Hide Totals" : "Show Totals"}
            </button>
          </>
        }
      />
      {totalsContent}
    </div>
  );
}

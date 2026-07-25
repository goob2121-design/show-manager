import Link from "next/link";
import { AdmissionsSyncPreviewPanel } from "@/app/components/tickets/admissions-sync-preview-panel";

export type TicketSalesPanelProps = {
  showId: string;
  showSlug: string;
  isTicketImportOpen: boolean;
  isManualTicketFormOpen: boolean;
  onToggleTicketImport: () => void;
  onToggleManualTicketForm: () => void;
};

export function TicketSalesPanel({
  showId,
  showSlug,
  isTicketImportOpen,
  isManualTicketFormOpen,
  onToggleTicketImport,
  onToggleManualTicketForm,
}: TicketSalesPanelProps) {
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="text-base font-semibold text-stone-900">Ticket Sales &amp; Check-In</h3>
        <p className="text-sm text-stone-600">Import paid online orders, add manual tickets, or jump straight into door mode.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          onClick={onToggleTicketImport}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
        >
          {isTicketImportOpen ? "Hide Import Paid Online Orders" : "Import Paid Online Orders"}
        </button>
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
      </div>
      <AdmissionsSyncPreviewPanel showId={showId} showSlug={showSlug} />
    </div>
  );
}
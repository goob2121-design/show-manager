import type { ReactNode } from "react";
import { AdminBackButton } from "@/app/components/admin-back-button";
import { TicketSalesPanel, type TicketSalesPanelProps } from "@/app/components/tickets/ticket-sales-panel";
import { TicketReservedSeatingPanel, type TicketReservedSeatingPanelProps } from "@/app/components/tickets/reserved-seating-panel";
import { SponsorCompPanel, type SponsorCompPanelRow } from "@/app/components/tickets/sponsor-comp-panel";
import { TicketReportsPanel, type TicketReportsPanelProps } from "@/app/components/tickets/ticket-reports-panel";

export type TicketWorkflowSection = "ticket-sales" | "reserved-seating" | "sponsor-comp" | "reports";

type TicketsCheckInPanelProps = {
  activeSection: TicketWorkflowSection | null;
  isTotalsOpen: boolean;
  totalsContent: ReactNode;
  onToggleTotals: () => void;
  onSectionSelect: (section: TicketWorkflowSection) => void;
  ticketSalesPanelProps: TicketSalesPanelProps;
  reservedSeatingPanelProps: TicketReservedSeatingPanelProps;
  ticketReportsPanelProps: TicketReportsPanelProps;
  sponsorCompPanelProps: {
    compRows: SponsorCompPanelRow[];
    printStudioExportContext?: {
      showId?: string;
      showSlug?: string;
      showName?: string;
      showDate?: string;
      showTime?: string | null;
      venue?: string | null;
    };
    onEditCompEntry: (row: SponsorCompPanelRow) => void;
    onChangeSeatsForCompEntry: (row: SponsorCompPanelRow) => void;
    onPrintCompEntry: (row: SponsorCompPanelRow) => void;
  };
  children: ReactNode;
};

const ticketWorkflowSections: Array<{ key: TicketWorkflowSection; title: string; subtitle: string }> = [
  { key: "ticket-sales", title: "Ticket Sales & Check-In", subtitle: "Import orders, add tickets, and open door mode" },
  { key: "reserved-seating", title: "Reserved Seating", subtitle: "Manage seat assignments and seat cards" },
  { key: "sponsor-comp", title: "Sponsor & Comp Tickets", subtitle: "Manage sponsor comps and guest tickets" },
  { key: "reports", title: "Reports & Printouts", subtitle: "Print lists and backup sheets" },
];

export function TicketsCheckInPanel({
  activeSection,
  isTotalsOpen,
  totalsContent,
  onToggleTotals,
  onSectionSelect,
  ticketSalesPanelProps,
  reservedSeatingPanelProps,
  sponsorCompPanelProps,
  ticketReportsPanelProps,
  children,
}: TicketsCheckInPanelProps) {
  return (
    <section className="print-hidden flex flex-col gap-6 border-t border-stone-200 pt-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <AdminBackButton fallbackHref="/admin" />
          <h2 className="text-xl font-semibold">Tickets / Check-In</h2>
        </div>
        <p className="text-sm text-stone-600">
          Organize ticket imports, reserved seating, sponsor comps, and show-night check-in in the order you actually use them.
        </p>
      </div>

      <div className="grid gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h3 className="text-base font-semibold text-stone-900">Summary / Totals</h3>
            <p className="text-sm text-stone-600">Reference numbers for online sales, complimentary tickets, attendance, and sponsor comps.</p>
          </div>
          <button
            type="button"
            onClick={onToggleTotals}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            {isTotalsOpen ? "Hide Totals" : "Show Totals"}
          </button>
        </div>

        {totalsContent}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ticketWorkflowSections.map((section) => {
          const isActive = activeSection === section.key;

          return (
            <button
              key={section.key}
              type="button"
              onClick={() => onSectionSelect(section.key)}
              className={`rounded-2xl border p-4 text-left shadow-sm transition ${
                isActive
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                  : "border-stone-200 bg-white text-stone-900 hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              <p className="text-base font-semibold">{section.title}</p>
              <p className={`mt-1 text-sm ${isActive ? "text-emerald-800" : "text-stone-600"}`}>{section.subtitle}</p>
            </button>
          );
        })}
      </div>

      {activeSection === "ticket-sales" ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <TicketSalesPanel {...ticketSalesPanelProps} />
        </div>
      ) : null}

      {activeSection === "reserved-seating" ? (
        <TicketReservedSeatingPanel {...reservedSeatingPanelProps} />
      ) : null}

      {activeSection === "sponsor-comp" ? (
        <SponsorCompPanel {...sponsorCompPanelProps} />
      ) : null}

      {activeSection === "reports" ? (
        <TicketReportsPanel {...ticketReportsPanelProps} />
      ) : null}

      {children}
    </section>
  );
}
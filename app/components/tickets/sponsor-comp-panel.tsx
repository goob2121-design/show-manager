"use client";

import { useMemo, useState } from "react";

export type SponsorCompPanelRow = {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  quantity: number;
  checkedIn: number;
  reservedSeats: string;
  notes: string;
};

type PrintStudioExportContext = {
  showId?: string;
  showSlug?: string;
  showName?: string;
  showDate?: string;
  showTime?: string | null;
  venue?: string | null;
};

type PrintStudioExportRecord = Partial<Record<"event_name" | "show_date" | "show_time" | "venue" | "purchaser_name" | "guest_name" | "sponsor_name" | "ticket_type" | "seat" | "section" | "ticket_number", string>>;

type SponsorCompPanelProps<RowType extends SponsorCompPanelRow> = {
  compRows: RowType[];
  printStudioExportContext?: PrintStudioExportContext;
  onEditCompEntry: (row: RowType) => void;
  onChangeSeatsForCompEntry: (row: RowType) => void;
  onPrintCompEntry: (row: RowType) => void;
};

function cleanRecord(record: PrintStudioExportRecord) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => typeof value === "string" && value.trim())) as PrintStudioExportRecord;
}

function splitSeatLabels(value: string) {
  return value.split(",").map((seat) => seat.trim()).filter(Boolean);
}

function buildPrintStudioRecords<RowType extends SponsorCompPanelRow>(rows: RowType[], context?: PrintStudioExportContext) {
  return rows.flatMap((row) => {
    const quantity = Math.max(1, Math.floor(row.quantity) || 1);
    const seats = splitSeatLabels(row.reservedSeats);
    return Array.from({ length: quantity }, (_, index) => {
      const name = row.name.trim();
      const base = {
        event_name: context?.showName,
        show_date: context?.showDate,
        show_time: context?.showTime || undefined,
        venue: context?.venue || undefined,
        ticket_type: row.categoryLabel,
        seat: seats[index] || undefined,
      } satisfies PrintStudioExportRecord;

      return cleanRecord(row.category === "sponsor"
        ? { ...base, sponsor_name: name }
        : { ...base, guest_name: name });
    });
  });
}

function buildExportFileName(context: PrintStudioExportContext | undefined, scope: "all" | "selected") {
  const showSlug = context?.showSlug || "show";
  return `print-studio-${showSlug}-sponsor-comp-${scope}-${new Date().toISOString().slice(0, 10)}.json`;
}

export function SponsorCompPanel<RowType extends SponsorCompPanelRow>({
  compRows,
  printStudioExportContext,
  onEditCompEntry,
  onChangeSeatsForCompEntry,
  onPrintCompEntry,
}: SponsorCompPanelProps<RowType>) {
  const sponsorCompTotal = compRows.filter((row) => row.category === "sponsor").reduce((sum, row) => sum + row.quantity, 0);
  const nonSponsorCompTotal = compRows.filter((row) => row.category !== "sponsor").reduce((sum, row) => sum + row.quantity, 0);
  const checkedInTotal = compRows.reduce((sum, row) => sum + row.checkedIn, 0);
  const totalTickets = compRows.reduce((sum, row) => sum + row.quantity, 0);
  const remainingTotal = Math.max(0, totalTickets - checkedInTotal);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const visibleRowIds = useMemo(() => compRows.map((row) => row.id), [compRows]);
  const selectedRows = compRows.filter((row) => selectedRowIds.includes(row.id));
  const allVisibleSelected = visibleRowIds.length > 0 && visibleRowIds.every((id) => selectedRowIds.includes(id));

  function toggleRowSelection(rowId: string) {
    setSelectedRowIds((current) => (current.includes(rowId)
      ? current.filter((id) => id !== rowId)
      : [...current, rowId]));
  }

  function toggleAllVisibleRows() {
    setSelectedRowIds(allVisibleSelected ? [] : visibleRowIds);
  }

  function handleExportForPrintStudio(rows: RowType[], scope: "all" | "selected") {
    const records = buildPrintStudioRecords(rows, printStudioExportContext);
    const exportFile = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      source: scope === "selected" ? "sponsor-comp-selected" : "sponsor-comp-all",
      showId: printStudioExportContext?.showId,
      showSlug: printStudioExportContext?.showSlug,
      records,
    };
    const blob = new Blob([JSON.stringify(exportFile, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildExportFileName(printStudioExportContext, scope);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-stone-900">Sponsor & Comp Tickets</h3>
          <p className="text-sm text-stone-600">
            Track sponsor comp check-ins separately from paid online and door tickets.
          </p>
        </div>
        {totalTickets > 0 ? (
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleExportForPrintStudio(selectedRows, "selected")}
                disabled={selectedRows.length === 0}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400"
              >
                Export Selected ({selectedRows.length})
              </button>
              <button type="button" onClick={() => handleExportForPrintStudio(compRows, "all")} className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100">
                Export All to Print Studio
              </button>
            </div>
            <p className="text-xs text-stone-500">Choose entries that use the same Print Studio template.</p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-500">No sponsor or comp records to export.</p>
        )}
      </div>

      <div className="mt-4 grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Sponsor Comps", sponsorCompTotal],
            ["General / Guest / Band / Other", nonSponsorCompTotal],
            ["Comps Checked In", checkedInTotal],
            ["Comps Remaining", remainingTotal],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">{label}</p>
              <p className="mt-1 text-2xl font-black text-stone-950">{value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-black uppercase tracking-[0.14em] text-stone-900">All Sponsor & Comp Entries</h4>
              <p className="mt-1 text-sm text-stone-600">Sponsor, guest, band, volunteer, media, other comps, and comp reserved seats assigned in Reserved Seating.</p>
            </div>
          </div>

          {compRows.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-sm text-stone-500">No sponsor or comp ticket entries are available yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200">
              <table className="min-w-full divide-y divide-stone-200 text-sm">
                <thead className="bg-stone-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
                  <tr><th className="px-3 py-2"><label className="sr-only" htmlFor="select-all-sponsor-comp-rows">Select all visible rows</label><input id="select-all-sponsor-comp-rows" type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisibleRows} aria-label="Select all visible rows" /></th><th className="px-3 py-2">Name / Sponsor</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Reserved Seat(s)</th><th className="px-3 py-2">Checked In</th><th className="px-3 py-2">Notes</th><th className="px-3 py-2">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white">
                  {compRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2"><input type="checkbox" checked={selectedRowIds.includes(row.id)} onChange={() => toggleRowSelection(row.id)} aria-label={`Select ${row.name}`} /></td>
                      <td className="px-3 py-2 font-semibold text-stone-900">{row.name}</td>
                      <td className="px-3 py-2 text-stone-700">{row.categoryLabel}</td>
                      <td className="px-3 py-2 text-stone-700">{row.quantity}</td>
                      <td className="px-3 py-2 text-stone-700">{row.reservedSeats || "-"}</td>
                      <td className="px-3 py-2 text-stone-700">{row.checkedIn} of {row.quantity}</td>
                      <td className="px-3 py-2 text-stone-600">{row.notes || "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" onClick={() => onEditCompEntry(row)} className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-100">Edit</button>
                          <button type="button" onClick={() => onChangeSeatsForCompEntry(row)} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-50">Seats</button>
                          <button type="button" onClick={() => onPrintCompEntry(row)} className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-100">Print</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

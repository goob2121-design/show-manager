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

type SponsorCompPanelProps<RowType extends SponsorCompPanelRow> = {
  compRows: RowType[];
  onEditCompEntry: (row: RowType) => void;
  onChangeSeatsForCompEntry: (row: RowType) => void;
  onPrintCompEntry: (row: RowType) => void;
};

export function SponsorCompPanel<RowType extends SponsorCompPanelRow>({
  compRows,
  onEditCompEntry,
  onChangeSeatsForCompEntry,
  onPrintCompEntry,
}: SponsorCompPanelProps<RowType>) {
  const sponsorCompTotal = compRows.filter((row) => row.category === "sponsor").reduce((sum, row) => sum + row.quantity, 0);
  const nonSponsorCompTotal = compRows.filter((row) => row.category !== "sponsor").reduce((sum, row) => sum + row.quantity, 0);
  const checkedInTotal = compRows.reduce((sum, row) => sum + row.checkedIn, 0);
  const remainingTotal = Math.max(0, compRows.reduce((sum, row) => sum + row.quantity, 0) - checkedInTotal);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-stone-900">Sponsor & Comp Tickets</h3>
          <p className="text-sm text-stone-600">
            Track sponsor comp check-ins separately from paid online and door tickets.
          </p>
        </div>
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
                  <tr><th className="px-3 py-2">Name / Sponsor</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Reserved Seat(s)</th><th className="px-3 py-2">Checked In</th><th className="px-3 py-2">Notes</th><th className="px-3 py-2">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white">
                  {compRows.map((row) => (
                    <tr key={row.id}>
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
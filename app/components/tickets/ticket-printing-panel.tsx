import type { ChangeEvent } from "react";

type TicketTemplateOption = {
  id: string;
  name: string;
};

type TicketPrintRow = {
  id: string;
  name: string;
  categoryLabel: string;
  quantity: number;
};

type GeneralAdmissionFormState = {
  quantity: string;
  showEvent: string;
  showDate: string;
  doorsTime: string;
  showTime: string;
  ticketPrefix: string;
  ticketStartNumber: string;
};

type TicketPrintingPanelProps = {
  isOpen: boolean;
  onToggleOpen: () => void;
  sponsorTemplateId: string;
  generalTemplateId: string;
  generalAdmissionTemplateId: string;
  sponsorTemplates: TicketTemplateOption[];
  generalTemplates: TicketTemplateOption[];
  generalAdmissionTemplates: TicketTemplateOption[];
  activeSponsorTemplateUrl: string | null | undefined;
  activeGeneralTemplateUrl: string | null | undefined;
  activeGeneralAdmissionTemplateUrl: string | null | undefined;
  isUploadingTemplate: boolean;
  hasSelectedTemplate: boolean;
  isDeletingSelectedTemplate: boolean;
  onSponsorTemplateSelect: (templateId: string) => void;
  onGeneralTemplateSelect: (templateId: string) => void;
  onGeneralAdmissionTemplateSelect: (templateId: string) => void;
  onUploadSponsorTemplate: (event: ChangeEvent<HTMLInputElement>) => void;
  onUploadGeneralTemplate: (event: ChangeEvent<HTMLInputElement>) => void;
  onUploadGeneralAdmissionTemplate: (event: ChangeEvent<HTMLInputElement>) => void;
  onDeleteSelectedTemplate: () => void;
  selectedPrintScope: string;
  compPrintRows: TicketPrintRow[];
  selectedPrintTicketCount: number;
  selectedSpecificPrintAdmissionType: string | null;
  selectedAssignedSeatLabels: string[];
  hasSelectedAssignedSeats: boolean;
  selectedAdmissionLabel: string;
  showName: string;
  showDate: string;
  onPrintScopeChange: (scope: string) => void;
  onUseAssignedSeats: () => void;
  onAssignSeats: () => void;
  onPrintTickets: () => void;
  onExportTicketsPdf: () => void;
  generalAdmissionFormState: GeneralAdmissionFormState;
  onGeneralAdmissionFormChange: (field: keyof GeneralAdmissionFormState, value: string) => void;
  onPrintGeneralAdmissionTickets: () => void;
  onExportGeneralAdmissionPdf: () => void;
  statusMessage: string | null;
  errorMessage: string | null;
};

export function TicketPrintingPanel({
  isOpen,
  onToggleOpen,
  sponsorTemplateId,
  generalTemplateId,
  generalAdmissionTemplateId,
  sponsorTemplates,
  generalTemplates,
  generalAdmissionTemplates,
  activeSponsorTemplateUrl,
  activeGeneralTemplateUrl,
  activeGeneralAdmissionTemplateUrl,
  isUploadingTemplate,
  hasSelectedTemplate,
  isDeletingSelectedTemplate,
  onSponsorTemplateSelect,
  onGeneralTemplateSelect,
  onGeneralAdmissionTemplateSelect,
  onUploadSponsorTemplate,
  onUploadGeneralTemplate,
  onUploadGeneralAdmissionTemplate,
  onDeleteSelectedTemplate,
  selectedPrintScope,
  compPrintRows,
  selectedPrintTicketCount,
  selectedSpecificPrintAdmissionType,
  selectedAssignedSeatLabels,
  hasSelectedAssignedSeats,
  selectedAdmissionLabel,
  showName,
  showDate,
  onPrintScopeChange,
  onUseAssignedSeats,
  onAssignSeats,
  onPrintTickets,
  onExportTicketsPdf,
  generalAdmissionFormState,
  onGeneralAdmissionFormChange,
  onPrintGeneralAdmissionTickets,
  onExportGeneralAdmissionPdf,
  statusMessage,
  errorMessage,
}: TicketPrintingPanelProps) {
  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-black uppercase tracking-[0.14em] text-amber-900">Ticket Printing</h4>
          <p className="mt-1 text-sm text-amber-900/80">Choose ticket templates, select a sponsor or comp group, then print or save as PDF.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggleOpen}
            className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
          >
            {isOpen ? "Hide Ticket Printer" : "Open Ticket Printer"}
          </button>
        </div>
      </div>

      {isOpen ? (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-3 rounded-2xl border border-amber-200 bg-white p-4">
            <div className="grid gap-3">
              <label className="flex flex-col gap-2 text-sm font-semibold text-stone-700">
                Sponsor Comp Ticket Template
                <select
                  value={sponsorTemplateId}
                  onChange={(event) => onSponsorTemplateSelect(event.target.value)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900"
                >
                  <option value="">Choose sponsor template</option>
                  {sponsorTemplates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-stone-700">
                Upload Sponsor Template
                <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={onUploadSponsorTemplate} disabled={isUploadingTemplate} className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700 disabled:cursor-not-allowed disabled:opacity-60" />
              </label>
              {activeSponsorTemplateUrl ? <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-100"><img src={activeSponsorTemplateUrl} alt="Sponsor ticket template preview" className="max-h-[120px] w-full object-contain" /></div> : <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-sm text-stone-500">Choose or upload the Sponsor Comp ticket template.</p>}
            </div>

            <div className="grid gap-3 border-t border-stone-200 pt-4">
              <label className="flex flex-col gap-2 text-sm font-semibold text-stone-700">
                General Comp Ticket Template
                <select
                  value={generalTemplateId}
                  onChange={(event) => onGeneralTemplateSelect(event.target.value)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900"
                >
                  <option value="">Choose general comp template</option>
                  {generalTemplates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-stone-700">
                Upload General Comp Template
                <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={onUploadGeneralTemplate} disabled={isUploadingTemplate} className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700 disabled:cursor-not-allowed disabled:opacity-60" />
              </label>
              {activeGeneralTemplateUrl ? <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-100"><img src={activeGeneralTemplateUrl} alt="General comp ticket template preview" className="max-h-[120px] w-full object-contain" /></div> : <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-sm text-stone-500">Choose or upload the General Comp ticket template for guest, band, volunteer, media, and other comps.</p>}
            </div>

            <div className="grid gap-3 border-t border-stone-200 pt-4">
              <label className="flex flex-col gap-2 text-sm font-semibold text-stone-700">
                General Admission Ticket Template
                <select
                  value={generalAdmissionTemplateId}
                  onChange={(event) => onGeneralAdmissionTemplateSelect(event.target.value)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900"
                >
                  <option value="">Choose GA template</option>
                  {generalAdmissionTemplates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-stone-700">
                Upload General Admission Template
                <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={onUploadGeneralAdmissionTemplate} disabled={isUploadingTemplate} className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700 disabled:cursor-not-allowed disabled:opacity-60" />
              </label>
              {activeGeneralAdmissionTemplateUrl ? <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-100"><img src={activeGeneralAdmissionTemplateUrl} alt="General Admission ticket template preview" className="max-h-[120px] w-full object-contain" /></div> : <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-sm text-stone-500">Choose or upload the General Admission ticket template.</p>}
            </div>

            {hasSelectedTemplate ? (
              <button type="button" onClick={onDeleteSelectedTemplate} disabled={isDeletingSelectedTemplate} className="w-fit rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60">
                Delete Selected Template
              </button>
            ) : null}
          </div>

          <div className="grid content-start gap-3 rounded-2xl border border-amber-200 bg-white p-4">
            <label className="flex flex-col gap-2 text-sm font-semibold text-stone-700">
              Ticket / Comp Entry to Print
              <select
                value={selectedPrintScope}
                onChange={(event) => onPrintScopeChange(event.target.value)}
                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900"
              >
                <option value="all">All comp tickets</option>
                <option value="sponsor">Sponsor comps only</option>
                <option value="non_sponsor">General comps only</option>
                {compPrintRows.map((row) => (
                  <option key={row.id} value={`row:${row.id}`}>{row.name} - {row.categoryLabel} - {row.quantity} ticket{row.quantity === 1 ? "" : "s"}</option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <p className="text-sm font-bold text-stone-900">Admission / Seats</p>
              {selectedSpecificPrintAdmissionType ? (
                hasSelectedAssignedSeats ? (
                  <div className="mt-2 grid gap-2">
                    <p className="text-sm font-semibold text-emerald-800">Seats assigned</p>
                    <p className="text-sm text-stone-700">{selectedAssignedSeatLabels.join(", ")}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={onUseAssignedSeats} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-100">Use Assigned Seats</button>
                      <button type="button" onClick={onAssignSeats} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100">Assign / Change Seats</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 grid gap-2">
                    <p className="text-sm font-semibold text-amber-900">No seats assigned</p>
                    <button type="button" onClick={onAssignSeats} className="w-fit rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100">Assign / Change Seats</button>
                  </div>
                )
              ) : (
                <p className="mt-2 text-sm font-semibold text-stone-600">Select one specific comp entry to assign seats.</p>
              )}
            </div>

            <div className="rounded-xl bg-stone-50 px-3 py-3 text-sm text-stone-700">
              <p><span className="font-semibold">Tickets ready:</span> {selectedPrintTicketCount}</p>
              <p><span className="font-semibold">Admission:</span> {selectedAdmissionLabel}</p>
              <p><span className="font-semibold">Seats:</span> {selectedSpecificPrintAdmissionType === "general_admission" ? "General Admission" : hasSelectedAssignedSeats ? "assigned" : "not assigned"}</p>
              <p><span className="font-semibold">Selected seats:</span> {selectedSpecificPrintAdmissionType === "general_admission" ? "GENERAL ADMISSION" : hasSelectedAssignedSeats ? selectedAssignedSeatLabels.join(", ") : "None"}</p>
              <p><span className="font-semibold">Show:</span> {showName}</p>
              <p><span className="font-semibold">Date:</span> {showDate}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onPrintTickets}
                className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-800"
              >
                Print Tickets
              </button>
              <button
                type="button"
                onClick={onExportTicketsPdf}
                className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-900 transition hover:bg-amber-100"
              >
                Export / Save PDF
              </button>
            </div>

            <div className="grid gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.12em] text-stone-900">General Admission Tickets</p>
                <p className="text-xs text-stone-600">No sponsor, comp entry, or reserved seats required.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700">Quantity<input type="number" min="1" value={generalAdmissionFormState.quantity} onChange={(event) => onGeneralAdmissionFormChange("quantity", event.target.value)} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900" /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700">Show / Event<input value={generalAdmissionFormState.showEvent} onChange={(event) => onGeneralAdmissionFormChange("showEvent", event.target.value)} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900" /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700">Show Date<input value={generalAdmissionFormState.showDate} onChange={(event) => onGeneralAdmissionFormChange("showDate", event.target.value)} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900" /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700">Doors<input value={generalAdmissionFormState.doorsTime} onChange={(event) => onGeneralAdmissionFormChange("doorsTime", event.target.value)} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900" /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700">Show Time<input value={generalAdmissionFormState.showTime} onChange={(event) => onGeneralAdmissionFormChange("showTime", event.target.value)} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900" /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700">Ticket Prefix<input placeholder="GA15-" value={generalAdmissionFormState.ticketPrefix} onChange={(event) => onGeneralAdmissionFormChange("ticketPrefix", event.target.value)} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900" /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700">Start Number<input type="number" min="1" value={generalAdmissionFormState.ticketStartNumber} onChange={(event) => onGeneralAdmissionFormChange("ticketStartNumber", event.target.value)} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900" /></label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onPrintGeneralAdmissionTickets} className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-stone-800">Print General Admission Tickets</button>
                <button type="button" onClick={onExportGeneralAdmissionPdf} className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-bold text-stone-800 transition hover:bg-stone-100">Export General Admission PDF</button>
              </div>
            </div>

            {statusMessage ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{statusMessage}</p> : null}
            {errorMessage ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{errorMessage}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

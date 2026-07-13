"use client";

import { calculateBatchPageLayout } from "./batch-page-layout";
import { formatSequentialTicketNumber, getEndingTicketNumber } from "./batch-record-generator";
import CollapsibleSection from "./collapsible-section";
import { batchSharedFieldTypes, fieldLabels } from "./sample-data";
import type { BatchSettings, BatchVariableFieldType, PrintRecord, PrintTemplate } from "./types";

type BatchDataPanelProps = {
  template: PrintTemplate;
  settings: BatchSettings;
  records: PrintRecord[];
  warnings: string[];
  importedRecords: PrintRecord[];
  importedSource?: string;
  importedWarnings: string[];
  importedErrors: string[];
  onImportedJsonFile: (file?: File) => void;
  onClearImportedRecords: () => void;
  onChange: (updates: Partial<BatchSettings>) => void;
  onSharedValueChange: (field: BatchVariableFieldType, value: string) => void;
};

function numberValue(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInteger(value: string, fallback: number) {
  return Math.max(1, Math.floor(numberValue(value, fallback)));
}

function integerValue(value: string, fallback: number) {
  return Math.floor(numberValue(value, fallback));
}

function RecordCards({ records, limit = 10 }: { records: PrintRecord[]; limit?: number }) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {records.slice(0, limit).map((record) => (
        <div key={record.id} className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
          <p className="font-bold text-slate-100">{record.ticket_number || record.id}</p>
          <p>{record.purchaser_name || record.guest_name || record.sponsor_name || "No name"}</p>
          <p className="text-xs text-slate-400">{record.ticket_type || "Ticket"} - {record.seat || "No seat"} - {record.section || "No section"}</p>
        </div>
      ))}
    </div>
  );
}

export default function BatchDataPanel({
  template,
  settings,
  records,
  warnings,
  importedRecords,
  importedSource,
  importedWarnings,
  importedErrors,
  onImportedJsonFile,
  onClearImportedRecords,
  onChange,
  onSharedValueChange,
}: BatchDataPanelProps) {
  const endingNumber = getEndingTicketNumber(settings);
  const numberPreviewIndexes = Array.from(new Set([0, 1, 2, 3, 4, Math.max(0, settings.quantity - 1)])).filter((index) => index < settings.quantity);
  const layout = calculateBatchPageLayout(template, settings);
  const firstTicket = formatSequentialTicketNumber(settings, 0);
  const lastTicket = formatSequentialTicketNumber(settings, Math.max(0, settings.quantity - 1));
  const inputClass = "mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100";
  const labelClass = "text-xs font-bold uppercase tracking-wide text-slate-400";
  const seatStart = `${settings.seatPrefix}${String(settings.seatStart).padStart(settings.seatPadding, "0")}`;
  const seatEndNumber = settings.seatStart + Math.max(0, settings.quantity - 1) * settings.seatIncrement;
  const seatEnd = `${settings.seatPrefix}${String(seatEndNumber).padStart(settings.seatPadding, "0")}`;
  const modeBadge = settings.mode === "custom_list" ? "Custom List" : settings.mode === "imported_json" ? "Imported JSON" : "Sequential Batch";
  const renderSequentialTicketNumbering = () => (
    <CollapsibleSection title="Sequential Ticket Numbering" defaultOpen badge={`${firstTicket}-${lastTicket}`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={labelClass}>Starting ticket number<input className={inputClass} type="number" value={settings.startingNumber} onChange={(event) => onChange({ startingNumber: integerValue(event.target.value, settings.startingNumber) })} /></label>
        <label className={labelClass}>Quantity<input className={inputClass} type="number" min="1" max="1000" value={settings.quantity} onChange={(event) => onChange({ quantity: positiveInteger(event.target.value, settings.quantity) })} /></label>
        <label className={labelClass}>Increment<input className={inputClass} type="number" min="1" value={settings.increment} onChange={(event) => onChange({ increment: positiveInteger(event.target.value, settings.increment) })} /></label>
        <label className={labelClass}>Number padding<input className={inputClass} type="number" min="0" max="12" value={settings.padding} onChange={(event) => onChange({ padding: Math.max(0, integerValue(event.target.value, settings.padding)) })} /></label>
        <label className={labelClass}>Prefix<input className={inputClass} value={settings.prefix} onChange={(event) => onChange({ prefix: event.target.value })} /></label>
        <label className={labelClass}>Suffix<input className={inputClass} value={settings.suffix} onChange={(event) => onChange({ suffix: event.target.value })} /></label>
      </div>
      <div className="mt-4 rounded-md border border-slate-800 bg-slate-950 px-3 py-3 text-sm text-slate-300">
        <p><span className="font-bold text-slate-100">Calculated ending number:</span> {endingNumber}</p>
        <p><span className="font-bold text-slate-100">First ticket:</span> {firstTicket}</p>
        <p><span className="font-bold text-slate-100">Last ticket:</span> {lastTicket}</p>
        <p className="mt-2 font-bold text-slate-100">Generated range preview</p>
        <p>{numberPreviewIndexes.map((index) => formatSequentialTicketNumber(settings, index)).join(", ")}</p>
        {settings.mode === "imported_json" ? (
          <p className="mt-2 text-slate-400">
            Imported ticket numbers are preserved. Missing numbers are generated from these settings.
          </p>
        ) : null}
      </div>
    </CollapsibleSection>
  );

  return (
    <>
      <CollapsibleSection title="Data Source" description="Choose how batch records are created for the shared ticket renderer." defaultOpen badge={modeBadge}>
        <div className="mb-4 flex flex-wrap gap-2 rounded-md border border-slate-700 bg-slate-950 p-1">
          <button type="button" onClick={() => onChange({ mode: "sequential" })} className={`rounded px-3 py-2 text-sm font-bold ${settings.mode === "sequential" ? "bg-emerald-700 text-white" : "text-slate-300 hover:bg-slate-900"}`}>Sequential Batch</button>
          <button type="button" onClick={() => onChange({ mode: "custom_list" })} className={`rounded px-3 py-2 text-sm font-bold ${settings.mode === "custom_list" ? "bg-emerald-700 text-white" : "text-slate-300 hover:bg-slate-900"}`}>Custom List</button>
          <button type="button" disabled className="rounded px-3 py-2 text-sm font-bold text-slate-600 opacity-60">StageFlow Import</button>
          <button type="button" onClick={() => onChange({ mode: "imported_json" })} className={`rounded px-3 py-2 text-sm font-bold ${settings.mode === "imported_json" ? "bg-emerald-700 text-white" : "text-slate-300 hover:bg-slate-900"}`}>Imported JSON</button>
        </div>

        {settings.mode === "sequential" ? (
          <div className="grid gap-4">
            <CollapsibleSection title="Default Values" description="Fallback values used on generated tickets unless a sequence overrides them." defaultOpen badge={settings.sharedValues.event_name || "Defaults"}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {batchSharedFieldTypes.map((field) => (
                  <label key={field} className={labelClass}>
                    {fieldLabels[field]}
                    <input className={inputClass} value={settings.sharedValues[field] || ""} onChange={(event) => onSharedValueChange(field, event.target.value)} />
                  </label>
                ))}
              </div>
            </CollapsibleSection>

            {renderSequentialTicketNumbering()}

            <CollapsibleSection title="Sequential Seat Sequence" description="Optional generated seats override the default Seat value." defaultOpen={false} badge={settings.seatSequenceEnabled ? `${seatStart}-${seatEnd}` : "Off"}>
              <label className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-200"><input type="checkbox" checked={settings.seatSequenceEnabled} onChange={(event) => onChange({ seatSequenceEnabled: event.target.checked })} />Generate seat sequence</label>
              {settings.seatSequenceEnabled ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelClass}>Seat prefix<input className={inputClass} value={settings.seatPrefix} onChange={(event) => onChange({ seatPrefix: event.target.value })} /></label>
                  <label className={labelClass}>Starting seat number<input className={inputClass} type="number" value={settings.seatStart} onChange={(event) => onChange({ seatStart: integerValue(event.target.value, settings.seatStart) })} /></label>
                  <label className={labelClass}>Seat increment<input className={inputClass} type="number" min="1" value={settings.seatIncrement} onChange={(event) => onChange({ seatIncrement: positiveInteger(event.target.value, settings.seatIncrement) })} /></label>
                  <label className={labelClass}>Seat number padding<input className={inputClass} type="number" min="0" max="12" value={settings.seatPadding} onChange={(event) => onChange({ seatPadding: Math.max(0, integerValue(event.target.value, settings.seatPadding)) })} /></label>
                </div>
              ) : null}
            </CollapsibleSection>
          </div>
        ) : settings.mode === "custom_list" ? (
          <CollapsibleSection title="Custom List" description="CSV-style rows using canonical Print Studio variable keys." defaultOpen badge="CSV">
            <textarea className="min-h-44 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100" value={settings.customListText} onChange={(event) => onChange({ customListText: event.target.value })} />
            <p className="mt-2 text-xs text-slate-500">If a custom row omits ticket_number, Print Studio generates one from the row index and ticket numbering settings.</p>
          </CollapsibleSection>
        ) : (
          <div className="grid gap-4">
            {renderSequentialTicketNumbering()}
            <CollapsibleSection title="Imported JSON" description="Import Print Studio-compatible records from a versioned JSON file." defaultOpen badge={`${importedRecords.length} imported`}>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer rounded-md bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-600">
                  Import JSON File
                  <input className="sr-only" type="file" accept=".json,application/json" onChange={(event) => onImportedJsonFile(event.target.files?.[0])} />
                </label>
                <button type="button" onClick={onClearImportedRecords} className="rounded-md border border-slate-700 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-slate-900">Clear Imported Records</button>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                <p><span className="font-bold text-slate-100">Imported source:</span> {importedSource || "None"}</p>
                <p><span className="font-bold text-slate-100">Imported record count:</span> {importedRecords.length}</p>
              </div>
              {importedErrors.length > 0 ? <div className="mt-3 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{importedErrors.map((error) => <p key={error}>{error}</p>)}</div> : null}
              {importedWarnings.length > 0 ? <div className="mt-3 rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{importedWarnings.slice(0, 8).map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
              <RecordCards records={importedRecords} limit={5} />
            </CollapsibleSection>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Page Layout" defaultOpen={false} badge={`${settings.paperSize.toUpperCase()} - ${layout.capacity} per sheet`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>Paper<select className={inputClass} value={settings.paperSize} onChange={(event) => onChange({ paperSize: event.target.value as BatchSettings["paperSize"] })}><option value="letter">Letter</option><option value="legal">Legal</option><option value="a4">A4</option><option value="custom">Custom</option></select></label>
          <label className={labelClass}>Page orientation<select className={inputClass} value={settings.pageOrientation} onChange={(event) => onChange({ pageOrientation: event.target.value as BatchSettings["pageOrientation"] })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
          {settings.paperSize === "custom" ? <><label className={labelClass}>Custom width<input className={inputClass} type="number" min="1" step="0.01" value={settings.customPageWidthInches} onChange={(event) => onChange({ customPageWidthInches: Math.max(1, numberValue(event.target.value, settings.customPageWidthInches)) })} /></label><label className={labelClass}>Custom height<input className={inputClass} type="number" min="1" step="0.01" value={settings.customPageHeightInches} onChange={(event) => onChange({ customPageHeightInches: Math.max(1, numberValue(event.target.value, settings.customPageHeightInches)) })} /></label></> : null}
          <label className={labelClass}>Top margin<input className={inputClass} type="number" min="0" step="0.01" value={settings.marginTopInches} onChange={(event) => onChange({ marginTopInches: Math.max(0, numberValue(event.target.value, settings.marginTopInches)) })} /></label>
          <label className={labelClass}>Right margin<input className={inputClass} type="number" min="0" step="0.01" value={settings.marginRightInches} onChange={(event) => onChange({ marginRightInches: Math.max(0, numberValue(event.target.value, settings.marginRightInches)) })} /></label>
          <label className={labelClass}>Bottom margin<input className={inputClass} type="number" min="0" step="0.01" value={settings.marginBottomInches} onChange={(event) => onChange({ marginBottomInches: Math.max(0, numberValue(event.target.value, settings.marginBottomInches)) })} /></label>
          <label className={labelClass}>Left margin<input className={inputClass} type="number" min="0" step="0.01" value={settings.marginLeftInches} onChange={(event) => onChange({ marginLeftInches: Math.max(0, numberValue(event.target.value, settings.marginLeftInches)) })} /></label>
          <label className={labelClass}>Horizontal gap<input className={inputClass} type="number" min="0" step="0.01" value={settings.horizontalGapInches} onChange={(event) => onChange({ horizontalGapInches: Math.max(0, numberValue(event.target.value, settings.horizontalGapInches)) })} /></label>
          <label className={labelClass}>Vertical gap<input className={inputClass} type="number" min="0" step="0.01" value={settings.verticalGapInches} onChange={(event) => onChange({ verticalGapInches: Math.max(0, numberValue(event.target.value, settings.verticalGapInches)) })} /></label>
        </div>
        <p className="mt-3 text-sm text-slate-400">Selected sheet: {layout.pageWidth.toFixed(2)}in x {layout.pageHeight.toFixed(2)}in. Tickets per sheet: {layout.capacity}.</p>
      </CollapsibleSection>

      <CollapsibleSection title="Generated Records" defaultOpen={false} badge={`${Math.min(10, records.length)} shown`}>
        <p className="text-sm text-slate-400">Generated tickets: {records.length}. Previewing first {Math.min(10, records.length)}.</p>
        {warnings.length > 0 ? <div className="mt-3 rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{warnings.slice(0, 6).map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
        <RecordCards records={records} />
      </CollapsibleSection>
    </>
  );
}

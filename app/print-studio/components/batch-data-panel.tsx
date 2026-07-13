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

export default function BatchDataPanel({
  template,
  settings,
  records,
  warnings,
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

  return (
    <CollapsibleSection
      title="Batch Data"
      description="Configure the records that feed the shared ticket renderer."
      defaultOpen
      badge={`${records.length} tickets`}
    >
      <div className="mb-4 inline-flex rounded-md border border-slate-700 bg-slate-950 p-1">
        <button
          type="button"
          onClick={() => onChange({ mode: "sequential" })}
          className={`rounded px-3 py-2 text-sm font-bold ${settings.mode === "sequential" ? "bg-emerald-700 text-white" : "text-slate-300"}`}
        >
          Sequential Batch
        </button>
        <button
          type="button"
          onClick={() => onChange({ mode: "custom_list" })}
          className={`rounded px-3 py-2 text-sm font-bold ${settings.mode === "custom_list" ? "bg-emerald-700 text-white" : "text-slate-300"}`}
        >
          Custom List
        </button>
      </div>

      <div className="grid gap-4">
        <CollapsibleSection title="Shared Values" description="Common values used on generated tickets unless a custom row or sequence overrides them." defaultOpen badge={settings.sharedValues.event_name || "Shared values"}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {batchSharedFieldTypes.map((field) => (
              <label key={field} className={labelClass}>
                {fieldLabels[field]}
                <input
                  className={inputClass}
                  value={settings.sharedValues[field] || ""}
                  onChange={(event) => onSharedValueChange(field, event.target.value)}
                />
              </label>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Ticket Numbering" defaultOpen badge={`${firstTicket}-${lastTicket}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelClass}>
              Starting ticket number
              <input className={inputClass} type="number" value={settings.startingNumber} onChange={(event) => onChange({ startingNumber: integerValue(event.target.value, settings.startingNumber) })} />
            </label>
            <label className={labelClass}>
              Quantity
              <input className={inputClass} type="number" min="1" max="1000" value={settings.quantity} onChange={(event) => onChange({ quantity: positiveInteger(event.target.value, settings.quantity) })} />
            </label>
            <label className={labelClass}>
              Increment
              <input className={inputClass} type="number" min="1" value={settings.increment} onChange={(event) => onChange({ increment: positiveInteger(event.target.value, settings.increment) })} />
            </label>
            <label className={labelClass}>
              Number padding
              <input className={inputClass} type="number" min="0" max="12" value={settings.padding} onChange={(event) => onChange({ padding: Math.max(0, integerValue(event.target.value, settings.padding)) })} />
            </label>
            <label className={labelClass}>
              Prefix
              <input className={inputClass} value={settings.prefix} onChange={(event) => onChange({ prefix: event.target.value })} />
            </label>
            <label className={labelClass}>
              Suffix
              <input className={inputClass} value={settings.suffix} onChange={(event) => onChange({ suffix: event.target.value })} />
            </label>
          </div>
          <div className="mt-4 rounded-md border border-slate-800 bg-slate-950 px-3 py-3 text-sm text-slate-300">
            <p><span className="font-bold text-slate-100">Calculated ending number:</span> {endingNumber}</p>
            <p><span className="font-bold text-slate-100">First ticket:</span> {firstTicket}</p>
            <p><span className="font-bold text-slate-100">Last ticket:</span> {lastTicket}</p>
            <p className="mt-2 font-bold text-slate-100">Generated range preview</p>
            <p>{numberPreviewIndexes.map((index) => formatSequentialTicketNumber(settings, index)).join(", ")}</p>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Seat Sequence" description="Optional generated seats override the shared Seat value." defaultOpen={false} badge={settings.seatSequenceEnabled ? `${seatStart}-${seatEnd}` : "Off"}>
          <label className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-200">
            <input type="checkbox" checked={settings.seatSequenceEnabled} onChange={(event) => onChange({ seatSequenceEnabled: event.target.checked })} />
            Generate seat sequence
          </label>
          {settings.seatSequenceEnabled ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Seat prefix
                <input className={inputClass} value={settings.seatPrefix} onChange={(event) => onChange({ seatPrefix: event.target.value })} />
              </label>
              <label className={labelClass}>
                Starting seat number
                <input className={inputClass} type="number" value={settings.seatStart} onChange={(event) => onChange({ seatStart: integerValue(event.target.value, settings.seatStart) })} />
              </label>
              <label className={labelClass}>
                Seat increment
                <input className={inputClass} type="number" min="1" value={settings.seatIncrement} onChange={(event) => onChange({ seatIncrement: positiveInteger(event.target.value, settings.seatIncrement) })} />
              </label>
              <label className={labelClass}>
                Seat number padding
                <input className={inputClass} type="number" min="0" max="12" value={settings.seatPadding} onChange={(event) => onChange({ seatPadding: Math.max(0, integerValue(event.target.value, settings.seatPadding)) })} />
              </label>
            </div>
          ) : null}
        </CollapsibleSection>

        {settings.mode === "custom_list" ? (
          <CollapsibleSection title="Custom List" description="CSV-style rows using canonical Print Studio variable keys." defaultOpen badge="CSV">
            <textarea
              className="min-h-44 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              value={settings.customListText}
              onChange={(event) => onChange({ customListText: event.target.value })}
            />
            <p className="mt-2 text-xs text-slate-500">If a custom row omits ticket_number, Print Studio generates one from the row index and ticket numbering settings.</p>
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection title="Page Layout" defaultOpen={false} badge={`${settings.paperSize.toUpperCase()} · ${layout.capacity} per sheet`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={labelClass}>
              Paper
              <select className={inputClass} value={settings.paperSize} onChange={(event) => onChange({ paperSize: event.target.value as BatchSettings["paperSize"] })}>
                <option value="letter">Letter</option>
                <option value="legal">Legal</option>
                <option value="a4">A4</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className={labelClass}>
              Page orientation
              <select className={inputClass} value={settings.pageOrientation} onChange={(event) => onChange({ pageOrientation: event.target.value as BatchSettings["pageOrientation"] })}>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            {settings.paperSize === "custom" ? (
              <>
                <label className={labelClass}>
                  Custom width
                  <input className={inputClass} type="number" min="1" step="0.01" value={settings.customPageWidthInches} onChange={(event) => onChange({ customPageWidthInches: Math.max(1, numberValue(event.target.value, settings.customPageWidthInches)) })} />
                </label>
                <label className={labelClass}>
                  Custom height
                  <input className={inputClass} type="number" min="1" step="0.01" value={settings.customPageHeightInches} onChange={(event) => onChange({ customPageHeightInches: Math.max(1, numberValue(event.target.value, settings.customPageHeightInches)) })} />
                </label>
              </>
            ) : null}
            <label className={labelClass}>
              Top margin
              <input className={inputClass} type="number" min="0" step="0.01" value={settings.marginTopInches} onChange={(event) => onChange({ marginTopInches: Math.max(0, numberValue(event.target.value, settings.marginTopInches)) })} />
            </label>
            <label className={labelClass}>
              Right margin
              <input className={inputClass} type="number" min="0" step="0.01" value={settings.marginRightInches} onChange={(event) => onChange({ marginRightInches: Math.max(0, numberValue(event.target.value, settings.marginRightInches)) })} />
            </label>
            <label className={labelClass}>
              Bottom margin
              <input className={inputClass} type="number" min="0" step="0.01" value={settings.marginBottomInches} onChange={(event) => onChange({ marginBottomInches: Math.max(0, numberValue(event.target.value, settings.marginBottomInches)) })} />
            </label>
            <label className={labelClass}>
              Left margin
              <input className={inputClass} type="number" min="0" step="0.01" value={settings.marginLeftInches} onChange={(event) => onChange({ marginLeftInches: Math.max(0, numberValue(event.target.value, settings.marginLeftInches)) })} />
            </label>
            <label className={labelClass}>
              Horizontal gap
              <input className={inputClass} type="number" min="0" step="0.01" value={settings.horizontalGapInches} onChange={(event) => onChange({ horizontalGapInches: Math.max(0, numberValue(event.target.value, settings.horizontalGapInches)) })} />
            </label>
            <label className={labelClass}>
              Vertical gap
              <input className={inputClass} type="number" min="0" step="0.01" value={settings.verticalGapInches} onChange={(event) => onChange({ verticalGapInches: Math.max(0, numberValue(event.target.value, settings.verticalGapInches)) })} />
            </label>
          </div>
          <p className="mt-3 text-sm text-slate-400">Selected sheet: {layout.pageWidth.toFixed(2)}in x {layout.pageHeight.toFixed(2)}in. Tickets per sheet: {layout.capacity}.</p>
        </CollapsibleSection>

        <CollapsibleSection title="Generated Records" defaultOpen={false} badge={`${Math.min(10, records.length)} shown`}>
          <p className="text-sm text-slate-400">Generated tickets: {records.length}. Previewing first {Math.min(10, records.length)}.</p>
          {warnings.length > 0 ? (
            <div className="mt-3 rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              {warnings.slice(0, 6).map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {records.slice(0, 10).map((record) => (
              <div key={record.id} className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                <p className="font-bold text-slate-100">{record.ticket_number || record.id}</p>
                <p>{record.purchaser_name || record.guest_name || record.sponsor_name || "No name"}</p>
                <p className="text-xs text-slate-400">{record.ticket_type || "Ticket"} - {record.seat || "No seat"} - {record.section || "No section"}</p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      </div>
    </CollapsibleSection>
  );
}

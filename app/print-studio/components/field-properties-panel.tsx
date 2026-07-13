"use client";

import { getPrintFieldResolution, getPrintFieldText, getPrintFieldVariableKey, type PrintFieldValueSource } from "./print-field-renderer";
import { fieldLabels } from "./sample-data";
import type { BatchVariableFieldType, PrintField, PrintFieldFontStyle, PrintFieldTextAlign, PrintRecord } from "./types";

type FieldPropertiesPanelProps = {
  field?: PrintField;
  previewRecord?: PrintRecord;
  sharedValues?: Partial<Record<BatchVariableFieldType, string>>;
  onUpdateField: (fieldId: string, updates: Partial<PrintField>) => void;
  onDeleteField: (fieldId: string) => void;
  onDuplicateField: (fieldId: string) => void;
  onBringForward: (fieldId: string) => void;
  onSendBackward: (fieldId: string) => void;
  onCopyFieldValueToShared: (field: BatchVariableFieldType, value: string) => void;
  onUseSharedValueAsOverride: (fieldId: string, value: string) => void;
};

const sourceLabels: Record<PrintFieldValueSource, string> = {
  record: "Per-ticket record",
  shared: "Shared batch value",
  override: "Template override",
  fallback: "Fallback / design text",
  empty: "Empty",
};

function numberValue(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function FieldPropertiesPanel({
  field,
  previewRecord,
  sharedValues,
  onUpdateField,
  onDeleteField,
  onDuplicateField,
  onBringForward,
  onSendBackward,
  onCopyFieldValueToShared,
  onUseSharedValueAsOverride,
}: FieldPropertiesPanelProps) {
  if (!field) {
    return (
      <aside className="rounded-lg border border-slate-700 bg-slate-900/80 p-4 shadow-xl shadow-black/20">
        <h2 className="text-base font-bold text-slate-100">Properties</h2>
        <p className="mt-2 text-sm text-slate-400">Select a field on the ticket to edit its position, size, and style.</p>
      </aside>
    );
  }

  const inputClass = "mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100";
  const labelClass = "text-xs font-bold uppercase tracking-wide text-slate-400";
  const variableKey = getPrintFieldVariableKey(field);
  const isVariableField = Boolean(variableKey);
  const resolution = getPrintFieldResolution(field, previewRecord, sharedValues);
  const canCopyToShared = Boolean(variableKey && variableKey !== "ticket_number");
  const sharedValue = variableKey ? sharedValues?.[variableKey] || "" : "";

  return (
    <aside className="rounded-lg border border-slate-700 bg-slate-900/80 p-4 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-100">Properties</h2>
          <p className="text-sm text-slate-400">{field.label}</p>
        </div>
        <button type="button" onClick={() => onDeleteField(field.id)} className="rounded-md bg-rose-700 px-3 py-2 text-sm font-bold text-white">
          Delete
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {[
          ["X", "x", 0, 100],
          ["Y", "y", 0, 100],
          ["Width", "width", 1, 100],
          ["Height", "height", 1, 100],
        ].map(([label, key, min, max]) => (
          <label key={String(key)} className={labelClass}>
            {label} %
            <input
              className={inputClass}
              type="number"
              min={Number(min)}
              max={Number(max)}
              step="0.25"
              value={field[key as "x" | "y" | "width" | "height"]}
              onChange={(event) => onUpdateField(field.id, { [key]: numberValue(event.target.value, 0) })}
            />
          </label>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Font size
          <input className={inputClass} type="number" min="4" max="96" value={field.fontSize} onChange={(event) => onUpdateField(field.id, { fontSize: numberValue(event.target.value, field.fontSize) })} />
        </label>
        <label className={labelClass}>
          Weight
          <select className={inputClass} value={field.fontWeight} onChange={(event) => onUpdateField(field.id, { fontWeight: numberValue(event.target.value, field.fontWeight) })}>
            <option value={400}>Regular</option>
            <option value={600}>Semi Bold</option>
            <option value={700}>Bold</option>
            <option value={800}>Extra Bold</option>
            <option value={900}>Black</option>
          </select>
        </label>
        <label className={labelClass}>
          Style
          <select className={inputClass} value={field.fontStyle} onChange={(event) => onUpdateField(field.id, { fontStyle: event.target.value as PrintFieldFontStyle })}>
            <option value="normal">Normal</option>
            <option value="italic">Italic</option>
          </select>
        </label>
        <label className={labelClass}>
          Align
          <select className={inputClass} value={field.textAlign} onChange={(event) => onUpdateField(field.id, { textAlign: event.target.value as PrintFieldTextAlign })}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label className={labelClass}>
          Rotation
          <input className={inputClass} type="number" min="-180" max="180" value={field.rotation} onChange={(event) => onUpdateField(field.id, { rotation: numberValue(event.target.value, field.rotation) })} />
        </label>
        <label className={labelClass}>
          Color
          <input className={`${inputClass} h-10 p-1`} type="color" value={field.color} onChange={(event) => onUpdateField(field.id, { color: event.target.value })} />
        </label>
        <label className={labelClass}>
          Letter spacing
          <input className={inputClass} type="number" min="-4" max="16" step="0.25" value={field.letterSpacing} onChange={(event) => onUpdateField(field.id, { letterSpacing: numberValue(event.target.value, field.letterSpacing) })} />
        </label>
        <label className={labelClass}>
          Line height
          <input className={inputClass} type="number" min="0.7" max="3" step="0.05" value={field.lineHeight} onChange={(event) => onUpdateField(field.id, { lineHeight: numberValue(event.target.value, field.lineHeight) })} />
        </label>
      </div>

      <label className={`mt-3 block ${labelClass}`}>
        Field label
        <input className={inputClass} value={field.label} onChange={(event) => onUpdateField(field.id, { label: event.target.value })} />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Data Source
          <input className={inputClass} value={isVariableField ? "Variable" : "Static"} readOnly />
        </label>
        <label className={labelClass}>
          Variable
          <input className={inputClass} value={variableKey ? fieldLabels[variableKey] : "None"} readOnly />
        </label>
      </div>

      {isVariableField ? (
        <>
          <div className="mt-3 rounded-md border border-slate-800 bg-slate-950 px-3 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Current Display Value</p>
            <p className="mt-1 break-words text-sm font-bold text-slate-100">{resolution.value || "(empty)"}</p>
            <p className="mt-1 text-xs text-slate-500">Source: {sourceLabels[resolution.source]}</p>
          </div>
          <label className={`mt-3 block ${labelClass}`}>
            Text Source
            <select className={inputClass} value={field.valueMode ?? "record"} onChange={(event) => onUpdateField(field.id, { valueMode: event.target.value as PrintField["valueMode"] })}>
              <option value="record">Record / Batch Value</option>
              <option value="override">Template Override</option>
            </select>
          </label>
          {(field.valueMode ?? "record") === "override" ? (
            <>
              <label className={`mt-3 block ${labelClass}`}>
                Override Text
                <textarea className={inputClass} rows={3} value={field.overrideText ?? field.sampleText ?? ""} onChange={(event) => onUpdateField(field.id, { overrideText: event.target.value })} />
              </label>
              <p className="mt-1 text-xs text-slate-500">Override Text controls the designer, previews, and print output for this template field.</p>
            </>
          ) : (
            <label className={`mt-3 block ${labelClass}`}>
              Fallback / Design Text
              <textarea className={inputClass} rows={3} value={field.sampleText ?? getPrintFieldText(field)} onChange={(event) => onUpdateField(field.id, { sampleText: event.target.value })} />
              <span className="mt-1 block text-xs normal-case tracking-normal text-slate-500">Used only when no record or shared batch value is available. Editing this does not change Batch Data.</span>
            </label>
          )}
          {canCopyToShared ? (
            <div className="mt-3 grid gap-2">
              <button type="button" onClick={() => variableKey && onCopyFieldValueToShared(variableKey, field.sampleText ?? "")} disabled={!field.sampleText} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-bold text-slate-100 disabled:cursor-not-allowed disabled:opacity-50">
                Copy Fallback to Shared Value
              </button>
              {field.overrideText ? (
                <button type="button" onClick={() => variableKey && onCopyFieldValueToShared(variableKey, field.overrideText ?? "")} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-bold text-slate-100">
                  Copy Override to Shared Value
                </button>
              ) : null}
              {sharedValue ? (
                <button type="button" onClick={() => onUseSharedValueAsOverride(field.id, sharedValue)} className="rounded-md border border-slate-700 px-3 py-2 text-sm font-bold text-slate-100">
                  Use Current Shared Value as Override
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <label className={`mt-3 block ${labelClass}`}>
          Text shown on ticket
          <textarea className={inputClass} rows={3} value={field.customText ?? field.textOverride ?? getPrintFieldText(field)} onChange={(event) => onUpdateField(field.id, { customText: event.target.value, textOverride: event.target.value })} />
        </label>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onDuplicateField(field.id)} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-bold text-slate-100">Duplicate</button>
        <button type="button" onClick={() => onBringForward(field.id)} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-bold text-slate-100">Bring Forward</button>
        <button type="button" onClick={() => onSendBackward(field.id)} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-bold text-slate-100">Send Back</button>
      </div>
    </aside>
  );
}
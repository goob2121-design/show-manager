"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminQuickNav } from "@/app/components/admin-quick-nav";
import BatchDataPanel from "./batch-data-panel";
import CloudTemplateControls from "./cloud-template-controls";
import CollapsibleSection from "./collapsible-section";
import { calculateBatchPageLayout, getBatchPaperDimensions } from "./batch-page-layout";
import { applyMissingTicketNumbers, generateBatchRecords } from "./batch-record-generator";
import { parseImportedPrintRecords } from "./imported-record-parser";
import BatchPrintPreview from "./batch-print-preview";
import DesignerCanvas from "./designer-canvas";
import FieldPropertiesPanel from "./field-properties-panel";
import FieldToolbar from "./field-toolbar";
import PrintPreview from "./print-preview";
import TicketRenderer from "./ticket-renderer";
import { createDefaultBatchSettings, createDefaultTemplate, fieldLabels, PRINT_STUDIO_STORAGE_KEY, sampleTicketData } from "./sample-data";
import { isPrintStudioVariableKey, PRINT_STUDIO_VARIABLE_KEYS } from "./variable-contract";
import type { BatchSettings, BatchVariableFieldType, PrintField, PrintFieldType, PrintOrientation, PrintRecord, PrintStudioSavedState, PrintTemplate } from "./types";

type PrintMode = "none" | "single" | "batch";

const MIN_FIELD_SIZE = 1;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createField(type: PrintFieldType, zIndex: number): PrintField {
  const isVariable = type !== "custom_text";

  return {
    id: createId("print-field"),
    type,
    label: fieldLabels[type],
    x: 12,
    y: 12,
    source: isVariable ? "variable" : "static",
    variableKey: isVariable ? type : undefined,
    valueMode: isVariable ? "record" : "override",
    sampleText: sampleTicketData[type],
    overrideText: type === "custom_text" ? "Custom Text" : undefined,
    width: type === "event_name" ? 48 : 26,
    height: type === "event_name" ? 14 : 10,
    rotation: 0,
    zIndex,
    fontSize: type === "event_name" ? 18 : 12,
    fontWeight: type === "event_name" ? 800 : 700,
    fontStyle: "normal",
    textAlign: type === "seat" ? "center" : "left",
    color: "#ffffff",
    letterSpacing: 0,
    lineHeight: 1.1,
    customText: type === "custom_text" ? "Custom Text" : undefined,
  };
}

function normalizeField(field: PrintField): PrintField {
  const isCanonicalVariable = field.type !== "custom_text";
  const source = field.source ?? (isCanonicalVariable ? "variable" : "static");
  const variableKey: BatchVariableFieldType | undefined =
    source === "variable" && isCanonicalVariable && field.variableKey && isPrintStudioVariableKey(field.variableKey)
      ? field.variableKey
      : source === "variable" && isCanonicalVariable && isPrintStudioVariableKey(field.type)
        ? field.type
        : undefined;
  const valueMode = field.valueMode ?? (source === "variable" ? "record" : "override");
  const sampleText = field.sampleText ?? (source === "variable" ? field.textOverride ?? sampleTicketData[variableKey ?? field.type] : field.customText ?? field.textOverride ?? sampleTicketData[field.type]);
  const overrideText = source === "variable" ? field.overrideText : field.overrideText ?? field.customText ?? field.textOverride;

  return {
    ...field,
    source,
    variableKey,
    valueMode,
    sampleText,
    overrideText,
    x: clamp(field.x, 0, 100 - Math.max(MIN_FIELD_SIZE, field.width)),
    y: clamp(field.y, 0, 100 - Math.max(MIN_FIELD_SIZE, field.height)),
    width: clamp(field.width, MIN_FIELD_SIZE, 100),
    height: clamp(field.height, MIN_FIELD_SIZE, 100),
  };
}

function normalizeTemplate(template: PrintTemplate): PrintTemplate {
  return {
    ...template,
    widthInches: clamp(template.widthInches || 5.5, 1, 24),
    heightInches: clamp(template.heightInches || 2, 1, 24),
    backgroundVisible: template.backgroundVisible ?? true,
    fields: template.fields.map(normalizeField),
  };
}

function normalizeBatchSettings(settings?: Partial<BatchSettings>): BatchSettings {
  const defaults = createDefaultBatchSettings();
  const mergedSharedValues = {
    ...defaults.sharedValues,
    ...(settings?.sharedValues ?? {}),
  };

  return {
    ...defaults,
    ...settings,
    mode: settings?.mode === "custom_list" || settings?.mode === "imported_json" ? settings.mode : "sequential",
    startingNumber: Math.floor(Number(settings?.startingNumber ?? defaults.startingNumber)) || defaults.startingNumber,
    quantity: clamp(Math.floor(Number(settings?.quantity ?? defaults.quantity)) || defaults.quantity, 1, 1000),
    increment: Math.max(1, Math.floor(Number(settings?.increment ?? defaults.increment)) || defaults.increment),
    padding: clamp(Math.floor(Number(settings?.padding ?? defaults.padding)) || 0, 0, 12),
    sharedValues: mergedSharedValues,
    seatSequenceEnabled: Boolean(settings?.seatSequenceEnabled),
    seatStart: Math.floor(Number(settings?.seatStart ?? defaults.seatStart)) || defaults.seatStart,
    seatIncrement: Math.max(1, Math.floor(Number(settings?.seatIncrement ?? defaults.seatIncrement)) || defaults.seatIncrement),
    seatPadding: clamp(Math.floor(Number(settings?.seatPadding ?? defaults.seatPadding)) || 0, 0, 12),
    paperSize: settings?.paperSize === "legal" || settings?.paperSize === "a4" || settings?.paperSize === "custom" ? settings.paperSize : defaults.paperSize,
    pageOrientation: settings?.pageOrientation === "landscape" ? "landscape" : defaults.pageOrientation,
    customPageWidthInches: clamp(Number(settings?.customPageWidthInches ?? defaults.customPageWidthInches) || defaults.customPageWidthInches, 1, 30),
    customPageHeightInches: clamp(Number(settings?.customPageHeightInches ?? defaults.customPageHeightInches) || defaults.customPageHeightInches, 1, 30),
    marginTopInches: clamp(Number(settings?.marginTopInches ?? defaults.marginTopInches) || 0, 0, 5),
    marginRightInches: clamp(Number(settings?.marginRightInches ?? defaults.marginRightInches) || 0, 0, 5),
    marginBottomInches: clamp(Number(settings?.marginBottomInches ?? defaults.marginBottomInches) || 0, 0, 5),
    marginLeftInches: clamp(Number(settings?.marginLeftInches ?? defaults.marginLeftInches) || 0, 0, 5),
    horizontalGapInches: clamp(Number(settings?.horizontalGapInches ?? defaults.horizontalGapInches) || 0, 0, 5),
    verticalGapInches: clamp(Number(settings?.verticalGapInches ?? defaults.verticalGapInches) || 0, 0, 5),
  };
}

function isSavedState(value: unknown): value is PrintStudioSavedState {
  return Boolean(value && typeof value === "object" && "template" in value);
}

export default function PrintStudioClient() {
  const [template, setTemplate] = useState<PrintTemplate>(() => normalizeTemplate(createDefaultTemplate()));
  const [batchSettings, setBatchSettings] = useState<BatchSettings>(() => createDefaultBatchSettings());
  const [selectedFieldId, setSelectedFieldId] = useState<string>();
  const [zoom, setZoom] = useState(100);
  const [saveMessage, setSaveMessage] = useState("Local save is browser-only for this prototype.");
  const [printMode, setPrintMode] = useState<PrintMode>("none");
  const [cloudTemplateId, setCloudTemplateId] = useState<string>();
  const [cloudTemplateName, setCloudTemplateName] = useState<string>();
  const [cloudBackgroundPath, setCloudBackgroundPath] = useState<string | null>(null);
  const [importedJsonRecords, setImportedJsonRecords] = useState<PrintRecord[]>([]);
  const [importedJsonWarnings, setImportedJsonWarnings] = useState<string[]>([]);
  const [importedJsonErrors, setImportedJsonErrors] = useState<string[]>([]);
  const [importedJsonSource, setImportedJsonSource] = useState<string>();

  const generatedBatchResult = useMemo(() => generateBatchRecords(batchSettings), [batchSettings]);
  const importedBatchResult = useMemo(() => {
    const resolvedImportedRecords = applyMissingTicketNumbers(importedJsonRecords, batchSettings);
    const records = resolvedImportedRecords.map((record, index) => {
      const merged: PrintRecord = {
        id: record.id || `imported-json-${index + 1}`,
        displayName: record.displayName,
      };
      PRINT_STUDIO_VARIABLE_KEYS.forEach((key) => {
        const value = record[key] || batchSettings.sharedValues[key];
        if (value) merged[key] = value;
      });
      merged.displayName = merged.displayName || merged.purchaser_name || merged.guest_name || merged.sponsor_name || merged.ticket_number || `Imported ${index + 1}`;
      return merged;
    });
    return { records, warnings: [...importedJsonWarnings, ...importedJsonErrors] };
  }, [batchSettings, importedJsonErrors, importedJsonRecords, importedJsonWarnings]);
  const batchResult = batchSettings.mode === "imported_json" ? importedBatchResult : generatedBatchResult;
  const batchPaper = getBatchPaperDimensions(batchSettings);
  const batchLayout = calculateBatchPageLayout(template, batchSettings);
  const batchRecords = batchResult.records;
  const batchSheetCount = Math.max(1, Math.ceil(batchRecords.length / batchLayout.capacity));
  const singlePreviewRecord = batchRecords[0];
  const selectedField = useMemo(
    () => template.fields.find((field) => field.id === selectedFieldId),
    [selectedFieldId, template.fields],
  );

  function updateTemplate(updates: Partial<PrintTemplate>) {
    setTemplate((current) => normalizeTemplate({ ...current, ...updates }));
  }

  function updateBatchSettings(updates: Partial<BatchSettings>) {
    setBatchSettings((current) => normalizeBatchSettings({ ...current, ...updates }));
  }

  function updateSharedBatchValue(field: BatchVariableFieldType, value: string) {
    setBatchSettings((current) => normalizeBatchSettings({
      ...current,
      sharedValues: {
        ...current.sharedValues,
        [field]: value,
      },
    }));
  }


  const updateField = useCallback((fieldId: string, updates: Partial<PrintField>) => {
    setTemplate((current) =>
      normalizeTemplate({
        ...current,
        fields: current.fields.map((field) => (field.id === fieldId ? { ...field, ...updates } : field)),
      }),
    );
  }, []);

  function copyFieldValueToShared(field: BatchVariableFieldType, value: string) {
    updateSharedBatchValue(field, value);
  }

  function useSharedValueAsOverride(fieldId: string, value: string) {
    updateField(fieldId, { valueMode: "override", overrideText: value });
  }


  function addField(type: PrintFieldType) {
    const nextZ = Math.max(0, ...template.fields.map((field) => field.zIndex)) + 1;
    const field = createField(type, nextZ);
    setTemplate((current) => normalizeTemplate({ ...current, fields: [...current.fields, field] }));
    setSelectedFieldId(field.id);
  }

  const deleteField = useCallback((fieldId: string) => {
    setTemplate((current) => normalizeTemplate({ ...current, fields: current.fields.filter((field) => field.id !== fieldId) }));
    setSelectedFieldId(undefined);
  }, []);

  function duplicateField(fieldId: string) {
    const source = template.fields.find((field) => field.id === fieldId);
    if (!source) return;
    const nextZ = Math.max(0, ...template.fields.map((field) => field.zIndex)) + 1;
    const duplicate = {
      ...source,
      id: createId("print-field"),
      x: clamp(source.x + 3, 0, 100 - source.width),
      y: clamp(source.y + 3, 0, 100 - source.height),
      zIndex: nextZ,
    };
    setTemplate((current) => normalizeTemplate({ ...current, fields: [...current.fields, duplicate] }));
    setSelectedFieldId(duplicate.id);
  }

  function moveStack(fieldId: string, direction: "forward" | "backward") {
    setTemplate((current) => {
      const selected = current.fields.find((field) => field.id === fieldId);
      if (!selected) return current;
      const delta = direction === "forward" ? 1 : -1;
      return {
        ...current,
        fields: current.fields.map((field) => (field.id === fieldId ? { ...field, zIndex: Math.max(0, selected.zIndex + delta) } : field)),
      };
    });
  }

  function handleBackgroundUpload(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") updateTemplate({ backgroundImage: reader.result, backgroundVisible: true });
    };
    reader.readAsDataURL(file);
  }

  async function handleImportedJsonFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setImportedJsonRecords([]);
      setImportedJsonWarnings([]);
      setImportedJsonErrors(["Please choose a .json file."]);
      setImportedJsonSource(file.name);
      return;
    }

    try {
      const result = parseImportedPrintRecords(await file.text());
      setImportedJsonRecords(result.records);
      setImportedJsonWarnings(result.warnings);
      setImportedJsonErrors(result.errors);
      setImportedJsonSource(result.source || file.name);
    } catch {
      setImportedJsonRecords([]);
      setImportedJsonWarnings([]);
      setImportedJsonErrors(["The selected JSON file could not be read."]);
      setImportedJsonSource(file.name);
    }
  }

  function clearImportedJsonRecords() {
    setImportedJsonRecords([]);
    setImportedJsonWarnings([]);
    setImportedJsonErrors([]);
    setImportedJsonSource(undefined);
  }

  function saveTemplate() {
    if (typeof window === "undefined") return;
    const savedState: PrintStudioSavedState = { template, batchSettings, cloudTemplateId, cloudTemplateName, cloudBackgroundPath };
    try {
      window.localStorage.setItem(PRINT_STUDIO_STORAGE_KEY, JSON.stringify(savedState));
      setSaveMessage("Template and batch data saved locally in this browser.");
    } catch {
      const withoutImage: PrintStudioSavedState = { template: { ...template, backgroundImage: undefined }, batchSettings, cloudTemplateId, cloudTemplateName, cloudBackgroundPath };
      window.localStorage.setItem(PRINT_STUDIO_STORAGE_KEY, JSON.stringify(withoutImage));
      setSaveMessage("Layout and batch data saved locally. The background image was too large and must be selected again.");
    }
  }

  function loadTemplate() {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(PRINT_STUDIO_STORAGE_KEY);
    if (!saved) {
      setSaveMessage("No locally saved Print Studio template was found.");
      return;
    }
    try {
      const parsed = JSON.parse(saved) as unknown;
      if (isSavedState(parsed)) {
        setTemplate(normalizeTemplate(parsed.template));
        setBatchSettings(normalizeBatchSettings(parsed.batchSettings));
      } else {
        setTemplate(normalizeTemplate(parsed as PrintTemplate));
        setBatchSettings(createDefaultBatchSettings());
      }
      setSelectedFieldId(undefined);
      setSaveMessage("Loaded the locally saved template and compatible batch settings.");
    } catch {
      setSaveMessage("The saved template could not be loaded.");
    }
  }

  function resetTemplate() {
    setTemplate(createDefaultTemplate());
    setBatchSettings(createDefaultBatchSettings());
    setSelectedFieldId(undefined);
    setZoom(100);
    setCloudTemplateId(undefined);
    setCloudTemplateName(undefined);
    setCloudBackgroundPath(null);
    clearImportedJsonRecords();
    setSaveMessage("Template and batch data reset to prototype defaults.");
  }

  function applyCloudTemplate(record: import("../cloud/types").CloudPrintTemplateRecord) {
    setTemplate(normalizeTemplate({
      ...record.template,
      backgroundImage: record.backgroundUrl ?? record.template.backgroundImage,
    }));
    setBatchSettings(normalizeBatchSettings(record.batchDefaults ?? undefined));
    setCloudTemplateId(record.id);
    setCloudTemplateName(record.name);
    setCloudBackgroundPath(record.backgroundPath);
    setSelectedFieldId(undefined);
    setSaveMessage(`Loaded cloud template "${record.name}". Local Save is still available.`);
  }

  function rememberCloudTemplate(record: import("../cloud/types").CloudPrintTemplateRecord) {
    setCloudTemplateId(record.id);
    setCloudTemplateName(record.name);
    setCloudBackgroundPath(record.backgroundPath);
    if (record.backgroundUrl && !template.backgroundImage?.startsWith("data:")) updateTemplate({ backgroundImage: record.backgroundUrl });
    setSaveMessage(`Cloud template "${record.name}" saved. Local Save is still available.`);
  }

  function clearCloudTemplateSelection(deletedTemplateId: string) {
    if (cloudTemplateId !== deletedTemplateId) return;
    setCloudTemplateId(undefined);
    setCloudTemplateName(undefined);
    setCloudBackgroundPath(null);
    setSaveMessage("No cloud template loaded.");
  }

  function printSingleTicket() {
    setPrintMode("single");
    window.requestAnimationFrame(() => window.print());
  }

  function printBatchTickets() {
    setPrintMode("batch");
    window.requestAnimationFrame(() => window.print());
  }

  const nudgeSelected = useCallback((dx: number, dy: number) => {
    if (!selectedField) return;
    updateField(selectedField.id, {
      x: Number(clamp(selectedField.x + dx, 0, 100 - selectedField.width).toFixed(2)),
      y: Number(clamp(selectedField.y + dy, 0, 100 - selectedField.height).toFixed(2)),
    });
  }, [selectedField, updateField]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!selectedField) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteField(selectedField.id);
        return;
      }

      const amount = event.shiftKey ? 2 : 0.5;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudgeSelected(-amount, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        nudgeSelected(amount, 0);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nudgeSelected(0, -amount);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        nudgeSelected(0, amount);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteField, nudgeSelected, selectedField]);

  return (
    <main className="print-studio-root min-h-dvh bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8" data-print-mode={printMode}>
      <style>{`
        @media print {
          @page {
            size: ${printMode === "batch" ? `${batchPaper.width}in ${batchPaper.height}in` : `${template.widthInches}in ${template.heightInches}in`};
            margin: 0;
          }

          body * {
            visibility: hidden !important;
          }

          .print-studio-print-root[data-print-active="true"],
          .print-studio-print-root[data-print-active="true"] * {
            visibility: visible !important;
          }

          .print-studio-print-root[data-print-active="false"] {
            display: none !important;
          }

          .print-studio-root {
            min-height: auto !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          .print-studio-root[data-print-mode="single"] .print-studio-screen {
            display: none !important;
          }


          .print-studio-print-root[data-print-active="true"] {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          .print-studio-single-print-root[data-print-active="true"] {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: ${template.widthInches}in !important;
            height: ${template.heightInches}in !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            transform: none !important;
          }

          .print-studio-ticket {
            width: ${template.widthInches}in !important;
            height: ${template.heightInches}in !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }


          .print-studio-batch-page {
            box-sizing: border-box !important;
            break-after: page;
            page-break-after: always;
            overflow: hidden !important;
          }

          .print-studio-batch-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        }
      `}</style>

      <div
        className="print-studio-single-print-root print-studio-print-root hidden print:block"
        data-print-active={printMode === "single" ? "true" : "false"}
      >
        <TicketRenderer template={template} record={singlePreviewRecord} />
      </div>

      <div className="print-studio-screen mx-auto max-w-7xl">
        <div className="print-hidden sticky top-3 z-30 mb-5">
          <AdminQuickNav slug="shows-dashboard" accessSlug="shows-dashboard" currentView="print-studio" staticLinksOnly />
        </div>
        <header className="print-hidden mb-5 rounded-lg border border-slate-700 bg-slate-900/90 p-5 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">StageFlow Prototype</p>
              <h1 className="mt-1 text-3xl font-black tracking-normal text-white">Print Studio</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Standalone visual ticket-template designer using sample data only. Nothing here is connected to existing ticket printers or live StageFlow data.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={saveTemplate} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-black text-white">
                Save Template Locally
              </button>
              <button type="button" onClick={loadTemplate} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-bold text-slate-100">
                Load Saved Template
              </button>
              <button type="button" onClick={resetTemplate} className="rounded-md border border-slate-700 px-4 py-2 text-sm font-bold text-slate-100">
                Reset Template
              </button>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-400">{saveMessage}</p>
          <CloudTemplateControls
            template={template}
            batchSettings={batchSettings}
            cloudTemplateId={cloudTemplateId}
            cloudTemplateName={cloudTemplateName}
            cloudBackgroundPath={cloudBackgroundPath}
            onCloudTemplateLoaded={applyCloudTemplate}
            onCloudTemplateSaved={rememberCloudTemplate}
            onCloudTemplateDeleted={clearCloudTemplateSelection}
          />
        </header>

        <div className="print-hidden mb-5">
          <CollapsibleSection title="Template Setup" defaultOpen badge={`${template.widthInches} x ${template.heightInches} in - ${template.orientation}`}>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400 lg:col-span-2">
              Template name
              <input className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" value={template.name} onChange={(event) => updateTemplate({ name: event.target.value })} />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Width
              <input className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" type="number" min="1" max="24" step="0.125" value={template.widthInches} onChange={(event) => updateTemplate({ widthInches: Number(event.target.value) })} />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Height
              <input className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" type="number" min="1" max="24" step="0.125" value={template.heightInches} onChange={(event) => updateTemplate({ heightInches: Number(event.target.value) })} />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Orientation
              <select className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" value={template.orientation} onChange={(event) => updateTemplate({ orientation: event.target.value as PrintOrientation })}>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Zoom {zoom}%
              <input className="mt-3 w-full accent-emerald-500" type="range" min="50" max="200" step="5" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Background
              <input className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" type="file" accept="image/*" onChange={(event) => handleBackgroundUpload(event.target.files?.[0])} />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <input type="checkbox" checked={template.backgroundVisible} onChange={(event) => updateTemplate({ backgroundVisible: event.target.checked })} />
            Show background image
          </label>
          </CollapsibleSection>
        </div>

        <div className="print-hidden mb-5">
          <FieldToolbar onAddField={addField} />
        </div>

        <div className="mb-5 print-hidden">
          <CollapsibleSection title="Designer Workspace" description="Edit placement and field properties." defaultOpen badge={`${template.widthInches} x ${template.heightInches} in - ${zoom}%`}>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <DesignerCanvas
                template={template}
                record={singlePreviewRecord}
                selectedFieldId={selectedFieldId}
                zoom={zoom}
                onSelectField={(fieldId) => setSelectedFieldId(fieldId || undefined)}
                onMoveField={(fieldId, x, y) => updateField(fieldId, { x, y })}
              />
              <FieldPropertiesPanel
                field={selectedField}
                previewRecord={singlePreviewRecord}
                sharedValues={batchSettings.sharedValues}
                onUpdateField={updateField}
                onDeleteField={deleteField}
                onDuplicateField={duplicateField}
                onBringForward={(fieldId) => moveStack(fieldId, "forward")}
                onSendBackward={(fieldId) => moveStack(fieldId, "backward")}
                onCopyFieldValueToShared={copyFieldValueToShared}
                onUseSharedValueAsOverride={useSharedValueAsOverride}
              />
            </div>
          </CollapsibleSection>
        </div>

        <div className="space-y-5">
          <PrintPreview
            template={template}
            record={singlePreviewRecord}
            isPrintActive={printMode === "single"}
            onPrint={printSingleTicket}
          />
          <CollapsibleSection title="Batch Printing" description="Configure records and preview the printable batch." defaultOpen={false} badge={`${batchRecords.length} tickets - ${batchSheetCount} sheets`}>
            <div className="grid gap-5">
              <BatchDataPanel
                template={template}
                settings={batchSettings}
                records={batchRecords}
                warnings={batchResult.warnings}
                importedRecords={importedJsonRecords}
                importedSource={importedJsonSource}
                importedWarnings={importedJsonWarnings}
                importedErrors={importedJsonErrors}
                onImportedJsonFile={handleImportedJsonFile}
                onClearImportedRecords={clearImportedJsonRecords}
                onChange={updateBatchSettings}
                onSharedValueChange={updateSharedBatchValue}
              />
              <BatchPrintPreview
                template={template}
                records={batchRecords}
                settings={batchSettings}
                isPrintActive={printMode === "batch"}
                onPrint={printBatchTickets}
              />
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </main>
  );
}










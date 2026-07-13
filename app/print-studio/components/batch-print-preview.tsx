"use client";

import { calculateBatchPageLayout, chunkBatchRecords } from "./batch-page-layout";
import CollapsibleSection from "./collapsible-section";
import TicketRenderer from "./ticket-renderer";
import type { BatchSettings, PrintRecord, PrintTemplate } from "./types";

type BatchPrintPreviewProps = {
  template: PrintTemplate;
  records: PrintRecord[];
  settings: BatchSettings;
  isPrintActive: boolean;
  onPrint: () => void;
};

const PREVIEW_SHEET_LIMIT = 2;

export default function BatchPrintPreview({
  template,
  records,
  settings,
  isPrintActive,
  onPrint,
}: BatchPrintPreviewProps) {
  const layout = calculateBatchPageLayout(template, settings);
  const pages = chunkBatchRecords(records, layout.capacity);
  const previewPages = pages.slice(0, PREVIEW_SHEET_LIMIT);
  const previewScale = Math.min(1, 7.5 / layout.pageWidth);

  return (
    <CollapsibleSection title="Batch Preview" description={`Previewing first ${previewPages.length} sheet${previewPages.length === 1 ? "" : "s"}.`} defaultOpen badge={`${records.length} tickets · ${pages.length} sheets`}>
      <div className="print-hidden mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm text-slate-400">
            Generated tickets: {records.length}. Tickets per sheet: {layout.capacity}. Total sheets: {pages.length}.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Previewing first {previewPages.length} sheet{previewPages.length === 1 ? "" : "s"}; Print Batch prints all generated tickets.
          </p>
        </div>
        <button type="button" onClick={onPrint} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-black text-white">
          Print Batch
        </button>
      </div>

      <div className="print-hidden overflow-auto rounded-md bg-slate-950 p-4">
        <div className="flex flex-col gap-6">
          {previewPages.map((pageRecords, pageIndex) => (
            <div
              key={`preview-page-${pageIndex}`}
              className="origin-top-left border border-slate-700 bg-white shadow-2xl"
              style={{
                width: `${layout.pageWidth}in`,
                height: `${layout.pageHeight}in`,
                transform: `scale(${previewScale})`,
                marginBottom: `${layout.pageHeight * (previewScale - 1)}in`,
              }}
            >
              <div
                className="grid"
                style={{
                  marginLeft: `${layout.offsetLeft}in`,
                  marginTop: `${layout.offsetTop}in`,
                  gridTemplateColumns: `repeat(${layout.columns}, ${template.widthInches}in)`,
                  gridAutoRows: `${template.heightInches}in`,
                  columnGap: `${settings.horizontalGapInches}in`,
                  rowGap: `${settings.verticalGapInches}in`,
                }}
              >
                {pageRecords.map((record) => (
                  <TicketRenderer key={record.id} template={template} record={record} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="print-studio-batch-print-root print-studio-print-root hidden print:block"
        data-print-active={isPrintActive ? "true" : "false"}
      >
        {pages.map((pageRecords, pageIndex) => (
          <section
            key={`batch-page-${pageIndex}`}
            className="print-studio-batch-page bg-white"
            style={{
              width: `${layout.pageWidth}in`,
              height: `${layout.pageHeight}in`,
            }}
          >
            <div
              className="grid"
              style={{
                marginLeft: `${layout.offsetLeft}in`,
                marginTop: `${layout.offsetTop}in`,
                gridTemplateColumns: `repeat(${layout.columns}, ${template.widthInches}in)`,
                gridAutoRows: `${template.heightInches}in`,
                columnGap: `${settings.horizontalGapInches}in`,
                rowGap: `${settings.verticalGapInches}in`,
              }}
            >
              {pageRecords.map((record) => (
                <TicketRenderer key={record.id} template={template} record={record} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </CollapsibleSection>
  );
}


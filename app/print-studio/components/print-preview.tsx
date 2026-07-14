"use client";

import { useRef, useState } from "react";
import CollapsibleSection from "./collapsible-section";
import TicketRenderer from "./ticket-renderer";
import type { PrintRecord, PrintTemplate } from "./types";

type PrintPreviewProps = {
  template: PrintTemplate;
  record?: PrintRecord;
  isPrintActive: boolean;
  onPrint: () => void;
};

function clampZoom(nextZoom: number) {
  return Math.min(300, Math.max(25, nextZoom));
}

export default function PrintPreview({ template, record, isPrintActive, onPrint }: PrintPreviewProps) {
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewZoom, setPreviewZoom] = useState(100);

  function updateZoom(nextZoom: number) {
    setPreviewZoom(clampZoom(nextZoom));
  }

  function fitToArea() {
    const container = previewContainerRef.current;
    if (!container) return;

    const ticketWidthPx = template.widthInches * 96;
    const ticketHeightPx = template.heightInches * 96;
    const availableWidth = Math.max(1, container.clientWidth - 32);
    const availableHeight = Math.max(1, container.clientHeight - 32);
    const fitScale = Math.min(availableWidth / ticketWidthPx, availableHeight / ticketHeightPx);

    updateZoom(Math.round(fitScale * 100));
  }

  return (
    <CollapsibleSection
      title="Single Ticket Preview"
      description="Rendered with physical inch dimensions and the current preview record."
      defaultOpen={false}
      badge={`${template.widthInches} x ${template.heightInches} in`}
    >
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => updateZoom(previewZoom - 25)} className="rounded-md border border-slate-700 px-3 py-2 text-sm font-bold text-slate-100">
            Zoom Out
          </button>
          <span className="min-w-20 text-center text-sm font-semibold text-slate-300">{previewZoom}%</span>
          <button type="button" onClick={() => updateZoom(previewZoom + 25)} className="rounded-md border border-slate-700 px-3 py-2 text-sm font-bold text-slate-100">
            Zoom In
          </button>
          <button type="button" onClick={fitToArea} className="rounded-md border border-slate-700 px-3 py-2 text-sm font-bold text-slate-100">
            Fit to Area
          </button>
          <button type="button" onClick={() => setPreviewZoom(100)} className="rounded-md border border-slate-700 px-3 py-2 text-sm font-bold text-slate-100">
            Reset to 100%
          </button>
        </div>
        <button type="button" onClick={onPrint} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-black text-white">
          Print Test Ticket
        </button>
      </div>
      <div
        ref={previewContainerRef}
        className="print-studio-print-root overflow-auto rounded-md bg-slate-950 p-4 print:overflow-visible print:bg-white print:p-0"
        data-print-active={isPrintActive ? "true" : "false"}
        style={{ minHeight: "28rem" }}
      >
        <div className="flex min-h-full items-start justify-center">
          <div
            style={{
              width: `${template.widthInches}in`,
              height: `${template.heightInches}in`,
              transform: `scale(${previewZoom / 100})`,
              transformOrigin: "top center",
            }}
          >
            <TicketRenderer template={template} record={record} />
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}

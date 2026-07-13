"use client";

import CollapsibleSection from "./collapsible-section";
import TicketRenderer from "./ticket-renderer";
import type { PrintRecord, PrintTemplate } from "./types";

type PrintPreviewProps = {
  template: PrintTemplate;
  record?: PrintRecord;
  isPrintActive: boolean;
  onPrint: () => void;
};

export default function PrintPreview({ template, record, isPrintActive, onPrint }: PrintPreviewProps) {
  return (
    <CollapsibleSection
      title="Single Ticket Preview"
      description="Rendered with physical inch dimensions and the current preview record."
      defaultOpen={false}
      badge={`${template.widthInches} x ${template.heightInches} in`}
    >
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={onPrint} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-black text-white">
          Print Test Ticket
        </button>
      </div>
      <div
        className="print-studio-print-root overflow-auto rounded-md bg-slate-950 p-4 print:overflow-visible print:bg-white print:p-0"
        data-print-active={isPrintActive ? "true" : "false"}
      >
        <TicketRenderer template={template} record={record} />
      </div>
    </CollapsibleSection>
  );
}

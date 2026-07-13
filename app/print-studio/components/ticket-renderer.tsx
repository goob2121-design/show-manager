"use client";

import PrintFieldRenderer from "./print-field-renderer";
import type { PrintRecord, PrintTemplate } from "./types";

type TicketRendererProps = {
  template: PrintTemplate;
  record?: PrintRecord;
  className?: string;
};

export default function TicketRenderer({ template, record, className = "" }: TicketRendererProps) {
  const sortedFields = [...template.fields].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      className={`print-studio-ticket relative overflow-hidden bg-white text-black shadow-2xl print:shadow-none ${className}`}
      style={{
        width: `${template.widthInches}in`,
        height: `${template.heightInches}in`,
      }}
    >
      {template.backgroundImage && template.backgroundVisible ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={template.backgroundImage} alt="" className="absolute inset-0 h-full w-full object-contain print:block" />
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#17324d,#0f172a_58%,#111827)]" />
      )}
      {sortedFields.map((field) => (
        <PrintFieldRenderer key={field.id} field={field} record={record} />
      ))}
    </div>
  );
}

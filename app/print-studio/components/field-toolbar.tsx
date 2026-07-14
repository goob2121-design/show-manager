"use client";

import CollapsibleSection from "./collapsible-section";
import { fieldLabels, fieldTypes } from "./sample-data";
import type { PrintFieldType } from "./types";

type FieldToolbarProps = {
  onAddField: (type: PrintFieldType) => void;
};

export default function FieldToolbar({ onAddField }: FieldToolbarProps) {
  return (
    <CollapsibleSection title="Add Fields" description="Add variable-backed and custom text fields to the ticket." defaultOpen={false} badge={`${fieldTypes.length} fields`}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {fieldTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onAddField(type)}
            className="min-h-10 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-emerald-400 hover:bg-slate-700"
          >
            {fieldLabels[type]}
          </button>
        ))}
      </div>
    </CollapsibleSection>
  );
}

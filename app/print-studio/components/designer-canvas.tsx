"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import PrintFieldRenderer from "./print-field-renderer";
import type { PrintField, PrintRecord, PrintTemplate } from "./types";

type DesignerCanvasProps = {
  template: PrintTemplate;
  record?: PrintRecord;
  selectedFieldId?: string;
  zoom: number;
  onSelectField: (fieldId: string) => void;
  onMoveField: (fieldId: string, x: number, y: number) => void;
};

export default function DesignerCanvas({
  template,
  record,
  selectedFieldId,
  zoom,
  onSelectField,
  onMoveField,
}: DesignerCanvasProps) {
  const aspectRatio = `${template.widthInches} / ${template.heightInches}`;
  const zoomScale = zoom / 100;
  const baseWidth = Math.max(240, template.widthInches * 96);
  const baseHeight = baseWidth / (template.widthInches / template.heightInches);
  const sortedFields = [...template.fields].sort((a, b) => a.zIndex - b.zIndex);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>, field: PrintField) {
    event.preventDefault();
    event.stopPropagation();
    onSelectField(field.id);

    const canvas = event.currentTarget.parentElement;
    if (!canvas) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startFieldX = field.x;
    const startFieldY = field.y;
    const bounds = canvas.getBoundingClientRect();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - startX) / bounds.width) * 100;
      const dy = ((moveEvent.clientY - startY) / bounds.height) * 100;
      const nextX = Math.min(100 - field.width, Math.max(0, startFieldX + dx));
      const nextY = Math.min(100 - field.height, Math.max(0, startFieldY + dy));
      onMoveField(field.id, Number(nextX.toFixed(2)), Number(nextY.toFixed(2)));
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900/80 p-4 shadow-xl shadow-black/20">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-100">Designer Canvas</h2>
          <p className="text-sm text-slate-400">Positions are stored as percentages of the ticket.</p>
        </div>
        <div className="text-sm font-semibold text-slate-300">
          {template.widthInches}&quot; x {template.heightInches}&quot; at {zoom}%
        </div>
      </div>
      <div className="overflow-auto rounded-md border border-slate-800 bg-slate-950 p-4">
        <div
          className="mx-auto"
          style={{
            width: `${baseWidth * zoomScale}px`,
            height: `${baseHeight * zoomScale}px`,
          }}
        >
          <div
            className="relative overflow-hidden rounded-md border border-slate-600 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 shadow-2xl"
            style={{
              width: `${baseWidth}px`,
              aspectRatio,
              transform: `scale(${zoomScale})`,
              transformOrigin: "top left",
            }}
            onPointerDown={() => onSelectField("")}
          >
            {template.backgroundImage && template.backgroundVisible ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={template.backgroundImage} alt="" className="absolute inset-0 h-full w-full object-contain" />
            ) : (
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(200,155,60,0.18),transparent_42%),linear-gradient(90deg,rgba(15,23,42,0.92),rgba(30,41,59,0.76))]" />
            )}
            {sortedFields.map((field) => (
              <PrintFieldRenderer
                key={field.id}
                field={field}
                record={record}
                isInteractive
                isSelected={field.id === selectedFieldId}
                onPointerDown={(event) => handlePointerDown(event, field)}
                onKeyboardSelect={() => onSelectField(field.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


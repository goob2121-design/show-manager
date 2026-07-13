"use client";

import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { isPrintStudioVariableKey } from "./variable-contract";
import type { BatchVariableFieldType, PrintField, PrintRecord } from "./types";

export type PrintFieldValueSource = "record" | "shared" | "override" | "fallback" | "empty";

export type PrintFieldResolution = {
  value: string;
  source: PrintFieldValueSource;
};

type PrintFieldRendererProps = {
  field: PrintField;
  record?: PrintRecord;
  children?: ReactNode;
  isSelected?: boolean;
  isInteractive?: boolean;
  onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyboardSelect?: () => void;
};

export function getPrintFieldVariableKey(field: PrintField): BatchVariableFieldType | undefined {
  if (field.source === "static" || field.type === "custom_text") return undefined;
  if (field.variableKey && isPrintStudioVariableKey(field.variableKey)) return field.variableKey;
  return isPrintStudioVariableKey(field.type) ? field.type : undefined;
}

export function getPrintFieldResolution(
  field: PrintField,
  record?: PrintRecord,
  sharedValues?: Partial<Record<BatchVariableFieldType, string>>,
): PrintFieldResolution {
  const variableKey = getPrintFieldVariableKey(field);

  if (!variableKey) {
    const value = field.customText ?? field.textOverride ?? field.overrideText ?? "";
    return { value, source: value ? "override" : "empty" };
  }

  if (field.valueMode === "override") {
    const value = field.overrideText ?? field.sampleText ?? "";
    return { value, source: field.overrideText ? "override" : value ? "fallback" : "empty" };
  }

  const recordValue = record?.[variableKey];
  if (recordValue) {
    return { value: recordValue, source: sharedValues?.[variableKey] === recordValue ? "shared" : "record" };
  }

  if (field.sampleText) return { value: field.sampleText, source: "fallback" };
  return { value: "", source: "empty" };
}

export function getPrintFieldText(field: PrintField, record?: PrintRecord) {
  return getPrintFieldResolution(field, record).value;
}

export function getPrintFieldStyle(field: PrintField): CSSProperties {
  return {
    left: `${field.x}%`,
    top: `${field.y}%`,
    width: `${field.width}%`,
    height: `${field.height}%`,
    zIndex: field.zIndex,
    transform: `rotate(${field.rotation}deg)`,
    color: field.color,
    fontSize: `${field.fontSize}px`,
    fontWeight: field.fontWeight,
    fontStyle: field.fontStyle,
    textAlign: field.textAlign,
    letterSpacing: `${field.letterSpacing}px`,
    lineHeight: field.lineHeight,
  };
}

export default function PrintFieldRenderer({
  field,
  record,
  children,
  isSelected = false,
  isInteractive = false,
  onPointerDown,
  onKeyboardSelect,
}: PrintFieldRendererProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!onKeyboardSelect) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onKeyboardSelect();
    }
  }

  const interactiveClasses = isInteractive
    ? `cursor-move select-none rounded-sm outline-none ring-offset-2 ring-offset-slate-950 ${
        isSelected ? "bg-emerald-400/15 ring-2 ring-emerald-300" : "ring-1 ring-white/20 hover:ring-emerald-200/70"
      }`
    : "";

  return (
    <div
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onPointerDown={onPointerDown}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      className={`absolute box-border flex items-center overflow-hidden px-1 ${interactiveClasses}`}
      style={getPrintFieldStyle(field)}
      title={field.label}
    >
      <span className="block w-full overflow-hidden text-clip whitespace-nowrap">{children ?? getPrintFieldText(field, record)}</span>
    </div>
  );
}






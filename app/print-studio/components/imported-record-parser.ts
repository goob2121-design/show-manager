import { PRINT_STUDIO_VARIABLE_KEYS } from "./variable-contract";
import type { BatchVariableFieldType, PrintRecord } from "./types";

export type ImportedRecordParseResult = {
  records: PrintRecord[];
  warnings: string[];
  errors: string[];
  source?: string;
};

const MAX_IMPORTED_RECORDS = 1000;
const allowedKeys = new Set<string>(PRINT_STUDIO_VARIABLE_KEYS);

type JsonRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeFieldValue(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value) || typeof value === "object") return { error: "Nested objects and arrays are not supported as field values." };
  const text = String(value).trim();
  return text ? { value: text } : undefined;
}

export function parseImportedPrintRecords(text: string): ImportedRecordParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { records: [], warnings: [], errors: ["The selected file is not valid JSON."] };
  }

  if (!isPlainObject(parsed)) {
    return { records: [], warnings: [], errors: ["Imported JSON must be an object with schemaVersion and records."] };
  }

  if (parsed.schemaVersion !== 1) {
    return { records: [], warnings: [], errors: ["Unsupported Print Studio JSON schemaVersion. Expected schemaVersion: 1."] };
  }

  if (!Array.isArray(parsed.records)) {
    return { records: [], warnings: [], errors: ["Imported JSON must include a records array."] };
  }

  if (parsed.records.length > MAX_IMPORTED_RECORDS) {
    return { records: [], warnings: [], errors: [`Imported JSON cannot contain more than ${MAX_IMPORTED_RECORDS} records.`] };
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  const records: PrintRecord[] = [];

  parsed.records.forEach((item, index) => {
    const rowNumber = index + 1;
    if (!isPlainObject(item)) {
      errors.push(`Record ${rowNumber} must be an object.`);
      return;
    }

    const record: Partial<Record<BatchVariableFieldType, string>> = {};
    Object.entries(item).forEach(([key, value]) => {
      if (!allowedKeys.has(key)) {
        warnings.push(`Record ${rowNumber}: Unknown key ignored: ${key}`);
        return;
      }

      const normalized = normalizeFieldValue(value);
      if (!normalized) return;
      if ("error" in normalized) {
        errors.push(`Record ${rowNumber}, ${key}: ${normalized.error}`);
        return;
      }
      record[key as BatchVariableFieldType] = normalized.value;
    });

    records.push({
      id: `imported-json-${rowNumber}-${record.ticket_number || rowNumber}`,
      displayName: record.purchaser_name || record.guest_name || record.sponsor_name || record.ticket_number || `Imported ${rowNumber}`,
      ...record,
    });
  });

  return {
    records: errors.length ? [] : records,
    warnings,
    errors,
    source: typeof parsed.source === "string" ? parsed.source.trim() : undefined,
  };
}
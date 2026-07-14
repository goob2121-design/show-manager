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
const emptyRecordDefaults = Object.fromEntries(
  PRINT_STUDIO_VARIABLE_KEYS.map((key) => [key, ""]),
) as Record<BatchVariableFieldType, string>;
const importKeyAliases: Partial<Record<string, BatchVariableFieldType>> = {
  name: "purchaser_name",
  customer_name: "purchaser_name",
  purchaser: "purchaser_name",
  guest: "guest_name",
  sponsor: "sponsor_name",
  admission_label: "ticket_type",
  admission_type: "ticket_type",
  type: "ticket_type",
  seat_label: "seat",
  seat_id: "seat",
};

type JsonRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeFieldValue(value: unknown) {
  if (value === null || value === undefined) return { value: "" };
  if (Array.isArray(value) || typeof value === "object") return { error: "Nested objects and arrays are not supported as field values." };
  return { value: typeof value === "string" ? value.trim() : String(value) };
}

function getCanonicalImportKey(key: string) {
  if (allowedKeys.has(key)) return key as BatchVariableFieldType;
  return importKeyAliases[key] ?? null;
}

function normalizeImportedRecord(record: Partial<Record<BatchVariableFieldType, string>>, rowNumber: number): PrintRecord {
  const normalizedRecord = {
    ...emptyRecordDefaults,
    ...record,
  };

  const displayName =
    normalizedRecord.purchaser_name ||
    normalizedRecord.guest_name ||
    normalizedRecord.sponsor_name ||
    normalizedRecord.ticket_number ||
    `Imported ${rowNumber}`;

  return {
    id: `imported-json-${rowNumber}-${normalizedRecord.ticket_number || rowNumber}`,
    displayName,
    ...normalizedRecord,
  };
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

  if (parsed.records.length === 0) {
    warnings.push("Imported JSON records array is empty.");
  }

  parsed.records.forEach((item, index) => {
    const rowNumber = index + 1;
    if (!isPlainObject(item)) {
      errors.push(`Record ${rowNumber} must be an object.`);
      return;
    }

    const record: Partial<Record<BatchVariableFieldType, string>> = {};
    Object.entries(item).forEach(([key, value]) => {
      const canonicalKey = getCanonicalImportKey(key);
      if (!canonicalKey) {
        warnings.push(`Record ${rowNumber}: Unknown key ignored: ${key}`);
        return;
      }

      const normalized = normalizeFieldValue(value);
      if ("error" in normalized) {
        errors.push(`Record ${rowNumber}, ${canonicalKey}: ${normalized.error}`);
        return;
      }
      record[canonicalKey] = normalized.value;
    });

    records.push(normalizeImportedRecord(record, rowNumber));
  });

  return {
    records: errors.length ? [] : records,
    warnings,
    errors,
    source: typeof parsed.source === "string" ? parsed.source.trim() : "",
  };
}

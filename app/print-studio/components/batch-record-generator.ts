import { sampleTicketData } from "./sample-data";
import { isPrintStudioVariableKey, PRINT_STUDIO_VARIABLE_KEYS } from "./variable-contract";
import type { BatchSettings, BatchVariableFieldType, PrintRecord } from "./types";

export const customListColumns: BatchVariableFieldType[] = [...PRINT_STUDIO_VARIABLE_KEYS];

export type ParsedCustomRecords = {
  records: Array<Partial<Record<BatchVariableFieldType, string>>>;
  warnings: string[];
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (inQuotes) {
    return { values: [...values, current.trim()], warning: "A row has an unmatched quote and was parsed as best effort." };
  }

  return { values: [...values, current.trim()] };
}

function isKnownColumn(value: string): value is BatchVariableFieldType {
  return isPrintStudioVariableKey(value);
}

export function parseCustomTicketRecords(text: string): ParsedCustomRecords {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  if (lines.length === 0) {
    return { records: [], warnings: ["No custom ticket records were entered."] };
  }

  const firstRow = parseCsvLine(lines[0]);
  const firstValues = firstRow.values.map((value) => value.trim());
  const hasHeader = firstValues.some((value) => isKnownColumn(value)) || firstValues.some((value) => value.includes("_"));
  const columns = hasHeader ? firstValues : customListColumns.slice(0, firstValues.length);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  if (firstRow.warning) warnings.push(`Line 1: ${firstRow.warning}`);

  columns.forEach((column) => {
    if (!isKnownColumn(column)) {
      warnings.push(`Unknown column ignored: ${column || "(blank)"}`);
    }
  });

  const records = dataLines.map((line, lineIndex) => {
    const parsed = parseCsvLine(line);
    const lineNumber = lineIndex + (hasHeader ? 2 : 1);
    if (parsed.warning) warnings.push(`Line ${lineNumber}: ${parsed.warning}`);
    if (parsed.values.length > columns.length) {
      warnings.push(`Line ${lineNumber}: Extra values were ignored.`);
    }

    return parsed.values.reduce<Partial<Record<BatchVariableFieldType, string>>>((record, value, valueIndex) => {
      const column = columns[valueIndex];
      if (column && isKnownColumn(column) && value) {
        record[column] = value;
      }
      return record;
    }, {});
  });

  return { records, warnings };
}

export function formatSequentialTicketNumber(settings: BatchSettings, index: number) {
  const numericValue = settings.startingNumber + index * settings.increment;
  return `${settings.prefix}${String(numericValue).padStart(settings.padding, "0")}${settings.suffix}`;
}

export function getEndingTicketNumber(settings: BatchSettings) {
  return settings.startingNumber + (settings.quantity - 1) * settings.increment;
}

function formatSeatSequence(settings: BatchSettings, index: number) {
  const numericValue = settings.seatStart + index * settings.seatIncrement;
  return `${settings.seatPrefix}${String(numericValue).padStart(settings.seatPadding, "0")}`;
}

function withSharedValues(settings: BatchSettings, record: Partial<Record<BatchVariableFieldType, string>>, index: number): PrintRecord {
  const ticketNumber = record.ticket_number || formatSequentialTicketNumber(settings, index);
  const seat = record.seat || (settings.seatSequenceEnabled ? formatSeatSequence(settings, index) : settings.sharedValues.seat);
  const merged: PrintRecord = {
    id: `batch-ticket-${index + 1}-${ticketNumber || index}`,
    displayName: record.purchaser_name || record.guest_name || record.sponsor_name || ticketNumber,
    ticket_number: ticketNumber,
  };

  customListColumns.forEach((key) => {
    const value = key === "ticket_number" ? ticketNumber : key === "seat" ? seat : record[key] || settings.sharedValues[key] || sampleTicketData[key];
    if (value) merged[key] = value;
  });

  return merged;
}

export function generateBatchRecords(settings: BatchSettings) {
  if (settings.mode === "custom_list") {
    const parsed = parseCustomTicketRecords(settings.customListText);
    return {
      records: parsed.records.map((record, index) => withSharedValues(settings, record, index)),
      warnings: parsed.warnings,
    };
  }

  const records = Array.from({ length: settings.quantity }, (_, index) => withSharedValues(settings, {}, index));
  return { records, warnings: [] };
}



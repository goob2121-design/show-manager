import { PRINT_STUDIO_VARIABLE_DEFINITIONS, PRINT_STUDIO_VARIABLE_KEYS } from "./variable-contract";
import type { BatchSettings, BatchVariableFieldType, PrintFieldType, PrintTemplate, SampleTicketData } from "./types";

export const PRINT_STUDIO_STORAGE_KEY = "stageflow:print-studio:prototype-template";

export const sampleTicketData: SampleTicketData = {
  event_name: "Cumberland Mountain Music Show",
  show_date: "August 15, 2026",
  show_time: "7:00 PM",
  venue: "Cumberland Gap Convention Center",
  purchaser_name: "Bryan Turner",
  guest_name: "Sample Guest",
  sponsor_name: "Sample Sponsor",
  ticket_type: "Reserved Admission",
  seat: "A12",
  section: "Center",
  ticket_number: "000123",
  custom_text: "Custom Text",
};

export const fieldLabels: Record<PrintFieldType, string> = {
  ...PRINT_STUDIO_VARIABLE_DEFINITIONS.reduce<Record<BatchVariableFieldType, string>>((labels, definition) => {
    labels[definition.key] = definition.label;
    return labels;
  }, {} as Record<BatchVariableFieldType, string>),
  custom_text: "Custom Text",
};

export const fieldTypes: PrintFieldType[] = [
  "event_name",
  "show_date",
  "show_time",
  "venue",
  "purchaser_name",
  "guest_name",
  "sponsor_name",
  "ticket_type",
  "seat",
  "section",
  "ticket_number",
  "custom_text",
];

export const batchSharedFieldTypes: BatchVariableFieldType[] = PRINT_STUDIO_VARIABLE_KEYS.filter((key) => key !== "ticket_number");

export function createDefaultBatchSettings(): BatchSettings {
  return {
    mode: "sequential",
    startingNumber: 1,
    quantity: 10,
    increment: 1,
    padding: 6,
    prefix: "",
    suffix: "",
    sharedValues: {
      event_name: sampleTicketData.event_name,
      show_date: sampleTicketData.show_date,
      show_time: sampleTicketData.show_time,
      venue: sampleTicketData.venue,
      purchaser_name: sampleTicketData.purchaser_name,
      guest_name: sampleTicketData.guest_name,
      sponsor_name: sampleTicketData.sponsor_name,
      ticket_type: sampleTicketData.ticket_type,
      section: sampleTicketData.section,
      seat: sampleTicketData.seat,
    },
    seatSequenceEnabled: false,
    seatPrefix: "A",
    seatStart: 1,
    seatIncrement: 1,
    seatPadding: 0,
    customListText: "ticket_number,purchaser_name,guest_name,sponsor_name,ticket_type,seat,section\n000101,Bryan Turner,,,Guest,A12,Center\n000102,Kelly Turner,,,Guest,A13,Center\n000103,,Gerald Mullins,,Comp,B4,Left\n000104,,,DeRoyal,Sponsor,C1,Right",
    paperSize: "letter",
    pageOrientation: "portrait",
    customPageWidthInches: 8.5,
    customPageHeightInches: 11,
    marginTopInches: 0.25,
    marginRightInches: 0.25,
    marginBottomInches: 0.25,
    marginLeftInches: 0.25,
    horizontalGapInches: 0.1,
    verticalGapInches: 0.1,
  };
}

export function createDefaultTemplate(): PrintTemplate {
  return {
    id: "prototype-ticket-template",
    name: "Prototype Ticket",
    kind: "reserved_seat_ticket",
    widthInches: 5.5,
    heightInches: 2,
    orientation: "landscape",
    backgroundVisible: true,
    fields: [
      {
        id: "field-event-name",
        type: "event_name",
        label: fieldLabels.event_name,
        x: 6,
        y: 14,
        width: 58,
        height: 16,
        rotation: 0,
        zIndex: 1,
        fontSize: 18,
        fontWeight: 800,
        fontStyle: "normal",
        textAlign: "left",
        color: "#f8fafc",
        letterSpacing: 0,
        lineHeight: 1.1,
      },
      {
        id: "field-show-date",
        type: "show_date",
        label: fieldLabels.show_date,
        x: 6,
        y: 34,
        width: 34,
        height: 12,
        rotation: 0,
        zIndex: 2,
        fontSize: 12,
        fontWeight: 700,
        fontStyle: "normal",
        textAlign: "left",
        color: "#d9f99d",
        letterSpacing: 0,
        lineHeight: 1.15,
      },
      {
        id: "field-seat",
        type: "seat",
        label: fieldLabels.seat,
        x: 74,
        y: 25,
        width: 18,
        height: 24,
        rotation: 0,
        zIndex: 3,
        fontSize: 24,
        fontWeight: 900,
        fontStyle: "normal",
        textAlign: "center",
        color: "#ffffff",
        letterSpacing: 0,
        lineHeight: 1,
      },
      {
        id: "field-ticket-number",
        type: "ticket_number",
        label: fieldLabels.ticket_number,
        x: 74,
        y: 66,
        width: 18,
        height: 10,
        rotation: 0,
        zIndex: 4,
        fontSize: 9,
        fontWeight: 700,
        fontStyle: "normal",
        textAlign: "center",
        color: "#cbd5e1",
        letterSpacing: 1,
        lineHeight: 1,
      },
    ],
  };
}



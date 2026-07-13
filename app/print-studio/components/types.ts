export type PrintFieldType =
  | "event_name"
  | "show_date"
  | "show_time"
  | "venue"
  | "purchaser_name"
  | "guest_name"
  | "sponsor_name"
  | "ticket_type"
  | "seat"
  | "section"
  | "ticket_number"
  | "custom_text";

export type BatchVariableFieldType = Exclude<PrintFieldType, "custom_text">;
export type PrintOrientation = "portrait" | "landscape";
export type PrintFieldFontStyle = "normal" | "italic";
export type PrintFieldTextAlign = "left" | "center" | "right";
export type PrintFieldSource = "variable" | "static";
export type PrintFieldValueMode = "record" | "override";
export type PrintTemplateKind =
  | "general_admission_ticket"
  | "sponsor_ticket"
  | "comp_ticket"
  | "guest_ticket"
  | "reserved_seat_ticket"
  | "badge"
  | "parking_pass"
  | "mailing_label";

export type PrintField = {
  id: string;
  type: PrintFieldType;
  label: string;
  source?: PrintFieldSource;
  variableKey?: BatchVariableFieldType;
  valueMode?: PrintFieldValueMode;
  sampleText?: string;
  overrideText?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  fontSize: number;
  fontWeight: number;
  fontStyle: PrintFieldFontStyle;
  textAlign: PrintFieldTextAlign;
  color: string;
  letterSpacing: number;
  lineHeight: number;
  textOverride?: string;
  customText?: string;
};

export type PrintTemplate = {
  id: string;
  name: string;
  kind: PrintTemplateKind;
  widthInches: number;
  heightInches: number;
  orientation: PrintOrientation;
  backgroundImage?: string;
  backgroundVisible: boolean;
  fields: PrintField[];
};

export type PrintRecord = Partial<Record<PrintFieldType, string>> & {
  id: string;
  displayName?: string;
};

export type BatchMode = "sequential" | "custom_list";
export type BatchPaperSize = "letter" | "legal" | "a4" | "custom";
export type BatchPageOrientation = "portrait" | "landscape";

export type BatchSettings = {
  mode: BatchMode;
  startingNumber: number;
  quantity: number;
  increment: number;
  padding: number;
  prefix: string;
  suffix: string;
  sharedValues: Partial<Record<BatchVariableFieldType, string>>;
  seatSequenceEnabled: boolean;
  seatPrefix: string;
  seatStart: number;
  seatIncrement: number;
  seatPadding: number;
  customListText: string;
  paperSize: BatchPaperSize;
  pageOrientation: BatchPageOrientation;
  customPageWidthInches: number;
  customPageHeightInches: number;
  marginTopInches: number;
  marginRightInches: number;
  marginBottomInches: number;
  marginLeftInches: number;
  horizontalGapInches: number;
  verticalGapInches: number;
};

export type PrintStudioSavedState = {
  template: PrintTemplate;
  batchSettings?: BatchSettings;
  cloudTemplateId?: string;
  cloudTemplateName?: string;
  cloudBackgroundPath?: string | null;
};

export type SampleTicketData = Record<PrintFieldType, string>;




import type { BatchSettings, PrintTemplate } from "../components/types";

export const PRINT_STUDIO_CLOUD_SCHEMA_VERSION = 1;

export type CloudPrintTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  templateKind: string;
  widthInches: number;
  heightInches: number;
  orientation: string;
  backgroundPath: string | null;
  schemaVersion: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CloudPrintTemplateRecord = CloudPrintTemplateSummary & {
  template: PrintTemplate;
  batchDefaults: BatchSettings | null;
  backgroundUrl: string | null;
};

export type CreateCloudPrintTemplateInput = {
  name: string;
  description?: string;
  template: PrintTemplate;
  batchDefaults?: BatchSettings;
  backgroundPath?: string | null;
  schemaVersion?: number;
};

export type UpdateCloudPrintTemplateInput = Partial<CreateCloudPrintTemplateInput> & {
  isArchived?: boolean;
};

export type CloudPrintTemplateListResponse = {
  success: boolean;
  templates?: CloudPrintTemplateSummary[];
  error?: string;
};

export type CloudPrintTemplateResponse = {
  success: boolean;
  template?: CloudPrintTemplateRecord;
  error?: string;
  deletedTemplateId?: string;
};

export type CloudBackgroundUploadResponse = {
  success: boolean;
  backgroundPath?: string;
  backgroundUrl?: string | null;
  error?: string;
};

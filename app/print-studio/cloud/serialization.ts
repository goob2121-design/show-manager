import { PRINT_STUDIO_CLOUD_SCHEMA_VERSION } from "./types";
import type { BatchSettings, PrintTemplate } from "../components/types";

export function isDataUrl(value: string | undefined): value is string {
  return Boolean(value?.startsWith("data:"));
}

export function stripBackgroundDataUrl(template: PrintTemplate): PrintTemplate {
  return { ...template, backgroundImage: undefined };
}

export function prepareTemplateForCloud(template: PrintTemplate): PrintTemplate {
  return stripBackgroundDataUrl(template);
}

export function prepareBatchDefaultsForCloud(settings: BatchSettings): BatchSettings {
  return {
    ...settings,
    customListText: "",
  };
}

export function createCloudPayload(template: PrintTemplate, batchSettings: BatchSettings, backgroundPath?: string | null) {
  return {
    name: template.name || "Untitled Print Studio Template",
    template: prepareTemplateForCloud(template),
    batchDefaults: prepareBatchDefaultsForCloud(batchSettings),
    backgroundPath: backgroundPath ?? null,
    schemaVersion: PRINT_STUDIO_CLOUD_SCHEMA_VERSION,
  };
}

export function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [metadata, content] = dataUrl.split(",");
  const mimeMatch = metadata.match(/^data:([^;]+);base64$/);
  const mimeType = mimeMatch?.[1] ?? "application/octet-stream";
  const binary = atob(content ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: mimeType });
}
import type { CloudBackgroundUploadResponse, CloudPrintTemplateListResponse, CloudPrintTemplateResponse, CreateCloudPrintTemplateInput, UpdateCloudPrintTemplateInput } from "./types";

const JSON_HEADERS = { "content-type": "application/json" };

function editorHeaders(editorKey: string): Record<string, string> {
  return editorKey.trim() ? { "x-print-studio-editor-key": editorKey.trim() } : {};
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T;
  if (!response.ok) {
    const error = typeof (payload as { error?: unknown }).error === "string" ? (payload as { error: string }).error : "Print Studio cloud request failed.";
    throw new Error(error);
  }
  return payload;
}

export async function listCloudTemplates(includeArchived: boolean): Promise<CloudPrintTemplateListResponse> {
  const params = includeArchived ? "?includeArchived=true" : "";
  const response = await fetch(`/api/print-studio/templates${params}`, { cache: "no-store" });
  return parseJson<CloudPrintTemplateListResponse>(response);
}

export async function createCloudTemplate(input: CreateCloudPrintTemplateInput, editorKey: string): Promise<CloudPrintTemplateResponse> {
  const response = await fetch("/api/print-studio/templates", {
    method: "POST",
    headers: { ...JSON_HEADERS, ...editorHeaders(editorKey) },
    body: JSON.stringify(input),
  });
  return parseJson<CloudPrintTemplateResponse>(response);
}

export async function getCloudTemplate(id: string): Promise<CloudPrintTemplateResponse> {
  const response = await fetch(`/api/print-studio/templates/${encodeURIComponent(id)}`, { cache: "no-store" });
  return parseJson<CloudPrintTemplateResponse>(response);
}

export async function updateCloudTemplate(id: string, input: UpdateCloudPrintTemplateInput, editorKey: string): Promise<CloudPrintTemplateResponse> {
  const response = await fetch(`/api/print-studio/templates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...JSON_HEADERS, ...editorHeaders(editorKey) },
    body: JSON.stringify(input),
  });
  return parseJson<CloudPrintTemplateResponse>(response);
}

export async function deleteCloudTemplate(id: string, editorKey: string): Promise<CloudPrintTemplateResponse> {
  const response = await fetch(`/api/print-studio/templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: editorHeaders(editorKey),
  });
  return parseJson<CloudPrintTemplateResponse>(response);
}

export async function uploadCloudBackground(id: string, file: File, editorKey: string): Promise<CloudBackgroundUploadResponse> {
  const formData = new FormData();
  formData.set("background", file);
  const response = await fetch(`/api/print-studio/templates/${encodeURIComponent(id)}/background`, {
    method: "POST",
    headers: editorHeaders(editorKey),
    body: formData,
  });
  return parseJson<CloudBackgroundUploadResponse>(response);
}

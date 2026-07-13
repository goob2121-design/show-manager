import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PRINT_STUDIO_VARIABLE_KEYS } from "@/app/print-studio/components/variable-contract";
import type { BatchSettings, PrintTemplate } from "@/app/print-studio/components/types";

const MAX_TEMPLATE_JSON_BYTES = 500_000;
const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;
export const PRINT_STUDIO_BACKGROUND_BUCKET = "print-studio-backgrounds";
export const ALLOWED_BACKGROUND_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Print Studio cloud storage is not configured on this server.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function requireEditorKey(request: Request) {
  const configured = process.env.PRINT_STUDIO_EDITOR_KEY;
  if (!configured) return "PRINT_STUDIO_EDITOR_KEY is not configured.";
  if (request.headers.get("x-print-studio-editor-key") !== configured) return "Print Studio editor key is invalid.";
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function validateJsonSize(value: unknown, label: string) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_TEMPLATE_JSON_BYTES) return `${label} is too large.`;
  return null;
}

function validateField(field: unknown) {
  if (!isPlainObject(field)) return "Each field must be an object.";
  if (typeof field.id !== "string" || !field.id.trim()) return "Each field needs an id.";
  if (typeof field.type !== "string") return "Each field needs a type.";
  if (field.type !== "custom_text" && !PRINT_STUDIO_VARIABLE_KEYS.includes(field.type as never)) return "Field type is not allowed.";
  if (field.variableKey !== undefined && !PRINT_STUDIO_VARIABLE_KEYS.includes(field.variableKey as never)) return "Field variable key is not allowed.";
  for (const key of ["x", "y", "width", "height", "rotation", "zIndex", "fontSize", "fontWeight", "letterSpacing", "lineHeight"] as const) {
    if (field[key] !== undefined && getNumber(field[key]) === undefined) return `Field ${key} must be numeric.`;
  }
  return null;
}

export function validateTemplate(template: unknown): template is PrintTemplate {
  if (!isPlainObject(template)) return false;
  if (typeof template.name !== "string" || !template.name.trim()) return false;
  if (typeof template.kind !== "string" || !template.kind.trim()) return false;
  const width = getNumber(template.widthInches);
  const height = getNumber(template.heightInches);
  if (!width || !height || width <= 0 || height <= 0 || width > 24 || height > 24) return false;
  if (template.orientation !== "portrait" && template.orientation !== "landscape") return false;
  if (!Array.isArray(template.fields)) return false;
  return template.fields.every((field) => validateField(field) === null);
}

export function validateTemplatePayload(template: unknown, batchDefaults: unknown) {
  if (!validateTemplate(template)) return "Template payload is invalid.";
  const templateSizeError = validateJsonSize(template, "Template JSON");
  if (templateSizeError) return templateSizeError;
  if (batchDefaults !== undefined && batchDefaults !== null) {
    if (!isPlainObject(batchDefaults)) return "Batch defaults must be an object.";
    const batchSizeError = validateJsonSize(batchDefaults, "Batch defaults JSON");
    if (batchSizeError) return batchSizeError;
  }
  return null;
}

export function validateBackgroundPath(path: unknown) {
  if (path === undefined || path === null || path === "") return null;
  if (typeof path !== "string") return "Background path must be text.";
  if (!path.startsWith("templates/") || path.includes("..") || path.includes("\\")) return "Background path is invalid.";
  return null;
}

export function sanitizeFileName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "print-studio-background";
}

export function getExtensionForMimeType(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return null;
}

export function validateBackgroundFile(file: File) {
  if (!ALLOWED_BACKGROUND_TYPES.has(file.type)) return "Background must be a PNG, JPEG, or WEBP image.";
  if (file.size > MAX_BACKGROUND_BYTES) return "Background image must be 10 MB or smaller.";
  return null;
}

type PrintStudioTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  template_kind: string;
  width_inches: number | string;
  height_inches: number | string;
  orientation: string;
  background_path: string | null;
  template_data?: PrintTemplate;
  batch_defaults?: BatchSettings | null;
  schema_version: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

function mapSummary(row: PrintStudioTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    templateKind: row.template_kind,
    widthInches: Number(row.width_inches),
    heightInches: Number(row.height_inches),
    orientation: row.orientation,
    backgroundPath: row.background_path,
    schemaVersion: row.schema_version,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function mapRecord(row: PrintStudioTemplateRow, backgroundUrl: string | null = null) {
  return {
    ...mapSummary(row),
    template: row.template_data,
    batchDefaults: row.batch_defaults ?? null,
    backgroundUrl,
  };
}

export function mapRows(rows: PrintStudioTemplateRow[]) {
  return rows.map(mapSummary);
}
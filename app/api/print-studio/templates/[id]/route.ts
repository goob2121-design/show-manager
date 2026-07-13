import { NextResponse } from "next/server";
import { PRINT_STUDIO_BACKGROUND_BUCKET, createServiceRoleSupabaseClient, jsonError, mapRecord, requireEditorKey, validateBackgroundPath, validateTemplatePayload } from "../../_lib";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function getSignedBackgroundUrl(supabase: ReturnType<typeof createServiceRoleSupabaseClient>, path: string | null) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(PRINT_STUDIO_BACKGROUND_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase.from("print_studio_templates").select("*").eq("id", id).single();
    if (error) throw error;
    const backgroundUrl = await getSignedBackgroundUrl(supabase, data.background_path ?? null);
    return NextResponse.json({ success: true, template: await mapRecord(data, backgroundUrl) });
  } catch (error) {
    console.error("Print Studio template load failed.", error);
    return jsonError(error instanceof Error ? error.message : "Failed to load Print Studio template.", 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const editorError = requireEditorKey(request);
    if (editorError) return jsonError(editorError, editorError.includes("configured") ? 503 : 401);
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return jsonError("Template name is required.", 400);
      update.name = name;
    }
    if (typeof body.description === "string") update.description = body.description.trim() || null;
    if (typeof body.isArchived === "boolean") update.is_archived = body.isArchived;
    if (body.backgroundPath !== undefined) {
      const pathError = validateBackgroundPath(body.backgroundPath);
      if (pathError) return jsonError(pathError, 400);
      update.background_path = body.backgroundPath || null;
    }
    if (body.template !== undefined || body.batchDefaults !== undefined) {
      const payloadError = validateTemplatePayload(body.template, body.batchDefaults ?? null);
      if (payloadError) return jsonError(payloadError, 400);
      const template = body.template as { kind: string; widthInches: number; heightInches: number; orientation: string };
      update.template_data = body.template;
      update.batch_defaults = body.batchDefaults ?? null;
      update.template_kind = template.kind;
      update.width_inches = template.widthInches;
      update.height_inches = template.heightInches;
      update.orientation = template.orientation;
    }
    if (Number.isInteger(body.schemaVersion)) update.schema_version = Number(body.schemaVersion);
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase.from("print_studio_templates").update(update).eq("id", id).select("*").single();
    if (error) throw error;
    const backgroundUrl = await getSignedBackgroundUrl(supabase, data.background_path ?? null);
    return NextResponse.json({ success: true, template: await mapRecord(data, backgroundUrl) });
  } catch (error) {
    console.error("Print Studio template update failed.", error);
    return jsonError(error instanceof Error ? error.message : "Failed to update Print Studio template.", 500);
  }
}
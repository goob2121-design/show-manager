import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient, jsonError, mapRecord, mapRows, requireEditorKey, validateBackgroundPath, validateTemplatePayload } from "../_lib";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";
    const supabase = createServiceRoleSupabaseClient();
    let query = supabase.from("print_studio_templates").select("id,name,description,template_kind,width_inches,height_inches,orientation,background_path,schema_version,is_archived,created_at,updated_at").order("updated_at", { ascending: false });
    if (!includeArchived) query = query.eq("is_archived", false);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, templates: mapRows(data ?? []) });
  } catch (error) {
    console.error("Print Studio template list failed.", error);
    return jsonError(error instanceof Error ? error.message : "Failed to load Print Studio templates.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const editorError = requireEditorKey(request);
    if (editorError) return jsonError(editorError, editorError.includes("configured") ? 503 : 401);
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : null;
    const template = body.template;
    const batchDefaults = body.batchDefaults ?? null;
    const backgroundPath = typeof body.backgroundPath === "string" ? body.backgroundPath.trim() : body.backgroundPath ?? null;
    const schemaVersion = Number.isInteger(body.schemaVersion) ? Number(body.schemaVersion) : 1;
    if (!name) return jsonError("Template name is required.", 400);
    const payloadError = validateTemplatePayload(template, batchDefaults);
    if (payloadError) return jsonError(payloadError, 400);
    const pathError = validateBackgroundPath(backgroundPath);
    if (pathError) return jsonError(pathError, 400);
    const typedTemplate = template as { kind: string; widthInches: number; heightInches: number; orientation: string };
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase.from("print_studio_templates").insert({
      name,
      description,
      template_kind: typedTemplate.kind,
      width_inches: typedTemplate.widthInches,
      height_inches: typedTemplate.heightInches,
      orientation: typedTemplate.orientation,
      background_path: backgroundPath || null,
      template_data: template,
      batch_defaults: batchDefaults,
      schema_version: schemaVersion,
    }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ success: true, template: await mapRecord(data) });
  } catch (error) {
    console.error("Print Studio template create failed.", error);
    return jsonError(error instanceof Error ? error.message : "Failed to create Print Studio template.", 500);
  }
}
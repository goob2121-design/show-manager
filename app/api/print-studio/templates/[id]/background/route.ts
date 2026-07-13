import { NextResponse } from "next/server";
import { PRINT_STUDIO_BACKGROUND_BUCKET, createServiceRoleSupabaseClient, getExtensionForMimeType, jsonError, sanitizeFileName, requireEditorKey, validateBackgroundFile } from "../../../_lib";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const editorError = requireEditorKey(request);
    if (editorError) return jsonError(editorError, editorError.includes("configured") ? 503 : 401);
    const { id } = await context.params;
    const formData = await request.formData();
    const file = formData.get("background");
    if (!(file instanceof File)) return jsonError("Background image is required.", 400);
    const fileError = validateBackgroundFile(file);
    if (fileError) return jsonError(fileError, 400);
    const extension = getExtensionForMimeType(file.type);
    if (!extension) return jsonError("Background image type is not supported.", 400);
    const safeName = sanitizeFileName(file.name || `background.${extension}`).replace(/\.[^.]+$/, "");
    const filePath = `templates/${id}/${Date.now()}-${crypto.randomUUID()}-${safeName}.${extension}`;
    const supabase = createServiceRoleSupabaseClient();
    const { error: uploadError } = await supabase.storage.from(PRINT_STUDIO_BACKGROUND_BUCKET).upload(filePath, Buffer.from(await file.arrayBuffer()), { upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;
    const { data: signed, error: signedError } = await supabase.storage.from(PRINT_STUDIO_BACKGROUND_BUCKET).createSignedUrl(filePath, 60 * 60);
    if (signedError) throw signedError;
    return NextResponse.json({ success: true, backgroundPath: filePath, backgroundUrl: signed.signedUrl });
  } catch (error) {
    console.error("Print Studio background upload failed.", error);
    return jsonError(error instanceof Error ? error.message : "Failed to upload Print Studio background.", 500);
  }
}
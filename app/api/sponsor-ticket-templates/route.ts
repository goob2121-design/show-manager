import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";

export const runtime = "nodejs";

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing server-side Supabase environment variables.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function verifyAdminSlug(slug: string) {
  const cookieStore = await cookies();
  return verifyAdminSessionCookieValue(slug, cookieStore.get(getAdminSessionCookieName(slug))?.value);
}

function sanitizeFileName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "sponsor-ticket-template";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const showId = searchParams.get("showId")?.trim() ?? "";
    const slug = searchParams.get("slug")?.trim() ?? "";
    if (!showId || !slug) return NextResponse.json({ success: false, error: "showId and slug are required." }, { status: 400 });
    if (!(await verifyAdminSlug(slug))) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase.from("sponsor_ticket_templates").select("*").or(`show_id.eq.${showId},show_id.is.null`).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, templates: data ?? [] });
  } catch (error) {
    console.error("Sponsor ticket template load failed.", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to load sponsor ticket templates." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const showId = typeof formData.get("showId") === "string" ? String(formData.get("showId")).trim() : "";
    const slug = typeof formData.get("slug") === "string" ? String(formData.get("slug")).trim() : "";
    const templateFile = formData.get("template");
    const rawTemplateKind = String(formData.get("templateKind") ?? "sponsor");
    const templateKind = rawTemplateKind === "general" || rawTemplateKind === "general_admission" ? rawTemplateKind : "sponsor";
    if (!showId || !slug) return NextResponse.json({ success: false, error: "showId and slug are required." }, { status: 400 });
    if (!(await verifyAdminSlug(slug))) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    if (!(templateFile instanceof File)) return NextResponse.json({ success: false, error: "Template image is required." }, { status: 400 });
    const supabase = createServiceRoleSupabaseClient();
    const originalName = sanitizeFileName(templateFile.name || "sponsor-ticket-template");
    const filePath = `${showId}/${templateKind}/${Date.now()}-${originalName}`;
    const { error: uploadError } = await supabase.storage.from("sponsor-ticket-templates").upload(filePath, Buffer.from(await templateFile.arrayBuffer()), { upsert: true, contentType: templateFile.type || undefined });
    if (uploadError) throw uploadError;
    const { data: publicUrlData } = supabase.storage.from("sponsor-ticket-templates").getPublicUrl(filePath);
    const fallbackTemplateName = templateKind === "general_admission" ? "General Admission Ticket Template" : templateKind === "general" ? "General Comp Ticket Template" : "Sponsor Ticket Template";
    const { data, error } = await supabase.from("sponsor_ticket_templates").insert({ show_id: showId, template_kind: templateKind, name: templateFile.name.replace(/\.[^.]+$/, "") || fallbackTemplateName, file_name: originalName, file_path: filePath, file_url: publicUrlData.publicUrl, file_mime_type: templateFile.type || null, file_size: templateFile.size }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ success: true, template: data });
  } catch (error) {
    console.error("Sponsor ticket template save failed.", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to save sponsor ticket template." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { slug?: unknown; templateId?: unknown; filePath?: unknown };
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const templateId = typeof body.templateId === "string" ? body.templateId.trim() : "";
    const filePath = typeof body.filePath === "string" ? body.filePath.trim() : "";
    if (!slug || !templateId) return NextResponse.json({ success: false, error: "slug and templateId are required." }, { status: 400 });
    if (!(await verifyAdminSlug(slug))) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    const supabase = createServiceRoleSupabaseClient();
    if (filePath) await supabase.storage.from("sponsor-ticket-templates").remove([filePath]);
    const { error } = await supabase.from("sponsor_ticket_templates").delete().eq("id", templateId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sponsor ticket template delete failed.", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to delete sponsor ticket template." }, { status: 500 });
  }
}

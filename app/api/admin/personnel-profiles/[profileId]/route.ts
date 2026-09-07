import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { parsePersonnelDirectoryInput } from "@/lib/personnel-directory";

export const runtime = "nodejs";
type Context = { params: Promise<{ profileId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE; if (!url || !key) throw new Error("Personnel Directory is not configured."); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }
async function authorized(request: Request) { const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? ""; const store = await cookies(); return slug && verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value); }
export async function PATCH(request: Request, context: Context) {
  try {
    const { profileId } = await context.params;
    if (!uuid.test(profileId)) return NextResponse.json({ error: "A valid personnel profile ID is required." }, { status: 400 });
    if (!(await authorized(request))) return NextResponse.json({ error: "Admin access is required." }, { status: 401 });
    const input = parsePersonnelDirectoryInput((await request.json()) as Record<string, unknown>);
    if (!input) return NextResponse.json({ error: "Name, nonnegative pay, and a valid display order are required." }, { status: 400 });
    const { data, error } = await serviceClient().from("personnel_profiles").update({ display_name: input.displayName, default_role: input.defaultRole || null, default_pay_amount: input.defaultPayAmount, is_active: input.isActive, display_order: input.displayOrder, updated_at: new Date().toISOString() }).eq("id", profileId).select("id,display_name,default_role,default_pay_amount,is_active,display_order,created_at,updated_at").maybeSingle();
    if (error?.code === "23505") return NextResponse.json({ error: "A personnel profile with that name already exists." }, { status: 409 });
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Personnel profile was not found." }, { status: 404 });
    return NextResponse.json({ profile: data });
  } catch (error) { console.error("Personnel Directory update failed.", error); return NextResponse.json({ error: "Unable to update personnel profile." }, { status: 500 }); }
}

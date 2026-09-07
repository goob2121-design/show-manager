import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { parsePersonnelDirectoryInput } from "@/lib/personnel-directory";

export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Personnel Directory is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function authorize(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  const store = await cookies();
  return slug && verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value) ? slug : null;
}

export async function GET(request: Request) {
  try {
    if (!(await authorize(request))) return NextResponse.json({ error: "Admin access is required." }, { status: 401 });
    const { data, error } = await serviceClient().from("personnel_profiles")
      .select("id,display_name,default_role,default_pay_amount,is_active,display_order,created_at,updated_at")
      .order("display_order").order("display_name");
    if (error) throw error;
    return NextResponse.json({ profiles: data ?? [] });
  } catch (error) {
    console.error("Personnel Directory load failed.", error);
    return NextResponse.json({ error: "Unable to load Personnel Directory." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await authorize(request))) return NextResponse.json({ error: "Admin access is required." }, { status: 401 });
    const input = parsePersonnelDirectoryInput((await request.json()) as Record<string, unknown>);
    if (!input) return NextResponse.json({ error: "Name, nonnegative pay, and a valid display order are required." }, { status: 400 });
    const { data, error } = await serviceClient().from("personnel_profiles").insert({
      display_name: input.displayName, default_role: input.defaultRole || null,
      default_pay_amount: input.defaultPayAmount, is_active: input.isActive, display_order: input.displayOrder,
      updated_at: new Date().toISOString(),
    }).select("id,display_name,default_role,default_pay_amount,is_active,display_order,created_at,updated_at").single();
    if (error?.code === "23505") return NextResponse.json({ error: "A personnel profile with that name already exists." }, { status: 409 });
    if (error) throw error;
    return NextResponse.json({ profile: data }, { status: 201 });
  } catch (error) {
    console.error("Personnel Directory create failed.", error);
    return NextResponse.json({ error: "Unable to add personnel profile." }, { status: 500 });
  }
}

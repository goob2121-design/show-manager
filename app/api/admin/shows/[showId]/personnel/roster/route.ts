import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ showId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function client() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE; if (!url || !key) throw new Error("Show Personnel is not configured."); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }
async function authorize(request: Request, showId: string, supabase: ReturnType<typeof client>) {
 const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
 if (!uuid.test(showId) || !slug) return null;
 const { data: show } = await supabase.from("shows").select("id").eq("id", showId).eq("slug", slug).maybeSingle();
 const store = await cookies();
 return show && verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value) ? show : null;
}
export async function POST(request: Request, context: Context) {
 try {
  const { showId } = await context.params; const supabase = client();
  if (!(await authorize(request, showId, supabase))) return NextResponse.json({ error: "Admin access is required." }, { status: 401 });
  const [{ data: profiles, error: profileError }, { data: existing, error: existingError }] = await Promise.all([
   supabase.from("personnel_profiles").select("id,display_name,default_role,default_pay_amount,display_order").eq("is_active", true).order("display_order").order("display_name"),
   supabase.from("show_payout_items").select("personnel_profile_id").eq("show_id", showId).eq("entry_kind", "personnel"),
  ]);
  if (profileError) throw profileError; if (existingError) throw existingError;
  const assigned = new Set((existing ?? []).map((item) => item.personnel_profile_id).filter(Boolean));
  const missing = (profiles ?? []).filter((profile) => !assigned.has(profile.id));
  if (!missing.length) return NextResponse.json({ added: 0, skipped: (profiles ?? []).length });
  const { data, error } = await supabase.from("show_payout_items").insert(missing.map((profile) => ({ show_id: showId, entry_kind: "personnel", personnel_profile_id: profile.id, guest_profile_id: null, payee_name: profile.display_name, role_snapshot: profile.default_role, amount: profile.default_pay_amount, category: (profile.default_role ?? "").toLowerCase() === "mc" ? "MC" : "Band", display_order: profile.display_order, description: null, paid: false, paid_at: null, payment_method: null, payment_note: null, updated_at: new Date().toISOString() }))).select("id");
  if (error?.code === "23505") return NextResponse.json({ added: 0, skipped: (profiles ?? []).length });
  if (error) throw error;
  return NextResponse.json({ added: data?.length ?? 0, skipped: (profiles ?? []).length - (data?.length ?? 0) });
 } catch (error) { console.error("Standard roster add failed.", error); return NextResponse.json({ error: "Unable to add the standard roster." }, { status: 500 }); }
}

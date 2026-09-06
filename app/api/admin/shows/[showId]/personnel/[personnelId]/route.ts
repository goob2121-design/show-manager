import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAdminSessionCookieName,
  verifyAdminSessionCookieValue,
} from "@/lib/admin-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ showId: string; personnelId: string }> };
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Show Personnel is not configured.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
async function authorize(
  request: Request,
  showId: string,
  personnelId: string,
  supabase: ReturnType<typeof client>,
) {
  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  if (!uuid.test(showId) || !uuid.test(personnelId) || !slug)
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Valid identifiers are required." },
        { status: 400 },
      ),
    };
  const { data: show } = await supabase
    .from("shows")
    .select("id")
    .eq("id", showId)
    .eq("slug", slug)
    .maybeSingle();
  if (!show)
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Show was not found." },
        { status: 404 },
      ),
    };
  const store = await cookies();
  if (
    !verifyAdminSessionCookieValue(
      slug,
      store.get(getAdminSessionCookieName(slug))?.value,
    )
  )
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Admin access is required." },
        { status: 401 },
      ),
    };
  return { ok: true as const };
}
function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { showId, personnelId } = await context.params;
    const supabase = client();
    const access = await authorize(request, showId, personnelId, supabase);
    if (!access.ok) return access.response;
    const body = (await request.json()) as Record<string, unknown>;
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000)
      return NextResponse.json(
        { error: "Pay must be a valid nonnegative amount." },
        { status: 400 },
      );
    const paid = body.paid === true;
    const now = new Date().toISOString();
    const { data: existing, error: existingError } = await supabase
      .from("show_payout_items")
      .select("id, paid, paid_at")
      .eq("id", personnelId)
      .eq("show_id", showId)
      .eq("entry_kind", "personnel")
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing)
      return NextResponse.json(
        { error: "Show personnel row was not found." },
        { status: 404 },
      );
    const { data, error } = await supabase
      .from("show_payout_items")
      .update({
        role_snapshot: text(body.role) || null,
        amount: Math.round(amount * 100) / 100,
        paid,
        paid_at: paid ? (existing.paid_at ?? now) : null,
        payment_method: text(body.paymentMethod, 100) || null,
        payment_note: text(body.paymentNote, 1000) || null,
        updated_at: now,
      })
      .eq("id", personnelId)
      .eq("show_id", showId)
      .eq("entry_kind", "personnel")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return NextResponse.json(
        { error: "Show personnel row was not found." },
        { status: 404 },
      );
    return NextResponse.json({ personnel: data });
  } catch (error) {
    console.error("Show Personnel update failed.", error);
    return NextResponse.json(
      { error: "Unable to update Show Personnel." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { showId, personnelId } = await context.params;
    const supabase = client();
    const access = await authorize(request, showId, personnelId, supabase);
    if (!access.ok) return access.response;
    const { data, error } = await supabase
      .from("show_payout_items")
      .delete()
      .eq("id", personnelId)
      .eq("show_id", showId)
      .eq("entry_kind", "personnel")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return NextResponse.json(
        { error: "Show personnel row was not found." },
        { status: 404 },
      );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Show Personnel delete failed.", error);
    return NextResponse.json(
      { error: "Unable to remove Show Personnel." },
      { status: 500 },
    );
  }
}

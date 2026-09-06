import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAdminSessionCookieName,
  verifyAdminSessionCookieValue,
} from "@/lib/admin-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ showId: string }> };
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Show Personnel is not configured.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
function text(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function money(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000
    ? Math.round(amount * 100) / 100
    : null;
}
async function authorize(
  request: Request,
  showId: string,
  supabase: ReturnType<typeof serviceClient>,
) {
  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  if (!uuid.test(showId) || !slug)
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Valid show ID and slug are required." },
        { status: 400 },
      ),
    };
  const { data: show, error } = await supabase
    .from("shows")
    .select("id,slug,name,show_date")
    .eq("id", showId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!show)
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Show was not found." },
        { status: 404 },
      ),
    };
  const cookieStore = await cookies();
  if (
    !verifyAdminSessionCookieValue(
      slug,
      cookieStore.get(getAdminSessionCookieName(slug))?.value,
    )
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Admin access is required." },
        { status: 401 },
      ),
    };
  }
  return { ok: true as const, show };
}

export async function GET(request: Request, context: Context) {
  try {
    const { showId } = await context.params;
    const supabase = serviceClient();
    const access = await authorize(request, showId, supabase);
    if (!access.ok) return access.response;
    const [profiles, personnel, guests] = await Promise.all([
      supabase
        .from("personnel_profiles")
        .select(
          "id,display_name,default_role,default_pay_amount,is_active,display_order,created_at,updated_at",
        )
        .eq("is_active", true)
        .order("display_order")
        .order("display_name"),
      supabase
        .from("show_payout_items")
        .select("*")
        .eq("show_id", showId)
        .eq("entry_kind", "personnel")
        .order("display_order")
        .order("created_at"),
      supabase
        .from("guest_profiles")
        .select("id,name,instruments")
        .eq("show_id", showId)
        .order("created_at"),
    ]);
    if (profiles.error) throw profiles.error;
    if (personnel.error) throw personnel.error;
    if (guests.error) throw guests.error;
    return NextResponse.json({
      show: access.show,
      profiles: profiles.data ?? [],
      personnel: personnel.data ?? [],
      guests: guests.data ?? [],
    });
  } catch (error) {
    console.error("Show Personnel load failed.", error);
    return NextResponse.json(
      { error: "Unable to load Show Personnel." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { showId } = await context.params;
    const supabase = serviceClient();
    const access = await authorize(request, showId, supabase);
    if (!access.ok) return access.response;
    const body = (await request.json()) as Record<string, unknown>;
    const kind = body.kind;
    const amount = money(body.amount);
    if (amount === null)
      return NextResponse.json(
        { error: "Pay must be a valid nonnegative amount." },
        { status: 400 },
      );
    let row: Record<string, unknown>;
    if (kind === "regular") {
      const profileId = text(body.personnelProfileId, 50);
      if (!uuid.test(profileId))
        return NextResponse.json(
          { error: "A valid personnel profile is required." },
          { status: 400 },
        );
      const { data: profile, error } = await supabase
        .from("personnel_profiles")
        .select("id,display_name,default_role,default_pay_amount,display_order")
        .eq("id", profileId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!profile)
        return NextResponse.json(
          { error: "Active personnel profile was not found." },
          { status: 404 },
        );
      row = {
        personnel_profile_id: profile.id,
        guest_profile_id: null,
        payee_name: profile.display_name,
        role_snapshot: text(body.role) || profile.default_role,
        amount,
        category:
          (text(body.role) || profile.default_role || "").toLowerCase() === "mc"
            ? "MC"
            : "Band",
        display_order: profile.display_order,
      };
    } else if (kind === "guest") {
      const guestId = text(body.guestProfileId, 50);
      if (!uuid.test(guestId))
        return NextResponse.json(
          { error: "A valid show guest is required." },
          { status: 400 },
        );
      const { data: guest, error } = await supabase
        .from("guest_profiles")
        .select("id,name,instruments")
        .eq("id", guestId)
        .eq("show_id", showId)
        .maybeSingle();
      if (error) throw error;
      if (!guest?.name?.trim())
        return NextResponse.json(
          { error: "Show guest was not found or has no name." },
          { status: 404 },
        );
      row = {
        personnel_profile_id: null,
        guest_profile_id: guest.id,
        payee_name: guest.name.trim(),
        role_snapshot:
          text(body.role) || guest.instruments?.trim() || "Guest Artist",
        amount,
        category: "Guest",
        display_order: 100,
      };
    } else if (kind === "custom") {
      const name = text(body.name);
      if (!name)
        return NextResponse.json(
          { error: "Custom person name is required." },
          { status: 400 },
        );
      row = {
        personnel_profile_id: null,
        guest_profile_id: null,
        payee_name: name,
        role_snapshot: text(body.role) || null,
        amount,
        category: "Other Expense",
        display_order: 200,
      };
    } else {
      return NextResponse.json(
        { error: "Personnel type is invalid." },
        { status: 400 },
      );
    }
    const { data, error } = await supabase
      .from("show_payout_items")
      .insert({
        show_id: showId,
        entry_kind: "personnel",
        description: null,
        paid: false,
        paid_at: null,
        payment_method: null,
        payment_note: null,
        updated_at: new Date().toISOString(),
        ...row,
      })
      .select("*")
      .single();
    if (error?.code === "23505")
      return NextResponse.json(
        { error: "This person is already assigned to this show." },
        { status: 409 },
      );
    if (error) throw error;
    return NextResponse.json({ personnel: data }, { status: 201 });
  } catch (error) {
    console.error("Show Personnel create failed.", error);
    return NextResponse.json(
      { error: "Unable to add Show Personnel." },
      { status: 500 },
    );
  }
}

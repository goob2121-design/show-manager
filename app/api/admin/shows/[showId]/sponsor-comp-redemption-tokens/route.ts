import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { generateSponsorCompRedemptionTokenSet } from "@/lib/sponsor-comp-redemption-tokens";

export const runtime = "nodejs";
type Context = { params: Promise<{ showId: string }> };

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Sponsor comp redemption tokens are not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function authorize(showId: string, slug: string, supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase.from("shows").select("id,slug").eq("id", showId).eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const store = await cookies();
  return verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value);
}

export async function GET(request: Request, context: Context) {
  try {
    const { showId } = await context.params;
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim() ?? "";
    const showSponsorId = url.searchParams.get("showSponsorId")?.trim() ?? "";
    const supabase = createServiceClient();
    if (!slug || !showSponsorId || !(await authorize(showId, slug, supabase))) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    const { data, error } = await supabase.from("show_sponsor_comp_redemption_tokens").select("id,show_id,show_sponsor_id,token,ordinal,redeemed_at,redeemed_by,voided_at,created_at").eq("show_id", showId).eq("show_sponsor_id", showSponsorId).order("ordinal");
    if (error) throw error;
    return NextResponse.json({ success: true, tokens: data ?? [] });
  } catch (error) {
    console.error("Unable to load sponsor comp redemption tokens.", error);
    return NextResponse.json({ success: false, error: "Unable to load individual redemption barcodes." }, { status: 500 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { showId } = await context.params;
    const body = await request.json().catch(() => null) as { slug?: string; showSponsorId?: string } | null;
    const slug = body?.slug?.trim() ?? "";
    const showSponsorId = body?.showSponsorId?.trim() ?? "";
    const supabase = createServiceClient();
    if (!slug || !showSponsorId || !(await authorize(showId, slug, supabase))) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    const { data: sponsor, error: sponsorError } = await supabase.from("show_sponsors").select("comp_ticket_allowance").eq("id", showSponsorId).eq("show_id", showId).maybeSingle();
    if (sponsorError) throw sponsorError;
    if (!sponsor) return NextResponse.json({ success: false, error: "Sponsor allocation not found." }, { status: 404 });
    const allowance = Number(sponsor.comp_ticket_allowance) || 0;
    if (allowance <= 0) return NextResponse.json({ success: false, error: "This sponsor has no complimentary-ticket allowance." }, { status: 400 });
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data, error } = await supabase.rpc("generate_sponsor_comp_redemption_tokens", { p_show_id: showId, p_show_sponsor_id: showSponsorId, p_tokens: generateSponsorCompRedemptionTokenSet(allowance) });
      if (!error) return NextResponse.json({ success: true, tokens: data ?? [] });
      lastError = error;
      if (error.code !== "23505") break;
    }
    throw lastError;
  } catch (error) {
    console.error("Unable to generate sponsor comp redemption tokens.", error);
    return NextResponse.json({ success: false, error: "Unable to generate individual redemption barcodes." }, { status: 500 });
  }
}

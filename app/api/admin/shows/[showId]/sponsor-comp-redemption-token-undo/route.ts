import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName } from "@/lib/admin-session";
import { resolveDoorAccess } from "@/lib/door-access";
import { getDoorStaffSessionCookieName } from "@/lib/door-staff-session";
import type {
  SponsorCompRedemptionUndoResponse,
  SponsorCompRedemptionUndoResult,
} from "@/lib/sponsor-comp-redemption-tokens";

export const runtime = "nodejs";

interface SponsorCompRedemptionTokenUndoRouteContext {
  params: Promise<{ showId: string }>;
}

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Sponsor comp barcode undo is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request, context: SponsorCompRedemptionTokenUndoRouteContext) {
  try {
    const { showId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      slug?: string;
      tokenId?: string;
    } | null;
    const slug = body?.slug?.trim() ?? "";
    const tokenId = body?.tokenId?.trim() ?? "";

    if (!showId?.trim() || !slug || !tokenId) {
      return NextResponse.json(
        { success: false, error: "Show ID, slug, and sponsor token ID are required." } satisfies SponsorCompRedemptionUndoResponse,
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const accessRole = resolveDoorAccess({
      slug,
      showId,
      adminCookieValue: cookieStore.get(getAdminSessionCookieName(slug))?.value,
      doorStaffCookieValue: cookieStore.get(getDoorStaffSessionCookieName(slug))?.value,
    });
    if (!accessRole) {
      return NextResponse.json(
        { success: false, error: "Door Mode access is required." } satisfies SponsorCompRedemptionUndoResponse,
        { status: 401 },
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("undo_sponsor_comp_redemption_token", {
      p_show_id: showId,
      p_show_slug: slug,
      p_token_id: tokenId,
      p_undone_by: accessRole,
    });
    if (error) throw error;

    const row = (data as Array<Record<string, unknown>> | null)?.[0];
    if (!row) {
      throw new Error("Sponsor comp barcode undo returned no result.");
    }

    const result: SponsorCompRedemptionUndoResult = {
      resultStatus: row.result_status as SponsorCompRedemptionUndoResult["resultStatus"],
      tokenId: row.token_id as string | null,
      showSponsorId: row.show_sponsor_id as string | null,
      sponsorName: row.sponsor_name as string | null,
      ordinal: row.ordinal as number | null,
      allowance: row.allowance as number | null,
      checkedIn: row.checked_in as number | null,
      remaining: row.remaining as number | null,
      redeemedAt: row.redeemed_at as string | null,
    };

    return NextResponse.json({ success: true, result } satisfies SponsorCompRedemptionUndoResponse);
  } catch (error) {
    console.error("Sponsor comp barcode undo failed.", error);
    return NextResponse.json(
      { success: false, error: "Unable to undo this sponsor ticket check-in." } satisfies SponsorCompRedemptionUndoResponse,
      { status: 500 },
    );
  }
}

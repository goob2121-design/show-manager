import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/app/api/integrations/square/_lib";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";

export const runtime = "nodejs";

type FinanceSettingsRequest = {
  slug?: unknown;
  showId?: unknown;
  enabled?: unknown;
  startedAt?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FinanceSettingsRequest;
    const slug = textValue(body.slug);
    const showId = textValue(body.showId);
    const enabled = body.enabled === true;
    const startedAtValue = textValue(body.startedAt);
    const startedAt = startedAtValue ? new Date(startedAtValue) : null;

    if (!slug || !showId) {
      return NextResponse.json({ success: false, error: "A valid show is required." }, { status: 400 });
    }
    if (enabled && (!startedAt || Number.isNaN(startedAt.getTime()))) {
      return NextResponse.json({ success: false, error: "Choose a valid Finance sync start time before enabling." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const hasAdminAccess = verifyAdminSessionCookieValue(
      slug,
      cookieStore.get(getAdminSessionCookieName(slug))?.value,
    );
    if (!hasAdminAccess) {
      return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data: show, error: showError } = await supabase
      .from("shows")
      .select("id, slug")
      .eq("id", showId)
      .eq("slug", slug)
      .maybeSingle();
    if (showError) throw showError;
    if (!show) return NextResponse.json({ success: false, error: "Show not found." }, { status: 404 });

    const { error: updateError } = await supabase
      .from("shows")
      .update({
        square_finance_sync_enabled: enabled,
        square_finance_sync_started_at: startedAt ? startedAt.toISOString() : null,
      })
      .eq("id", showId)
      .eq("slug", slug);
    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Square Finance settings update failed.", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ success: false, error: "Unable to update Square Finance settings." }, { status: 500 });
  }
}

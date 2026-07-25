import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { loadAdmissionsSyncPreview } from "@/lib/admissions-sync-preview";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ showId: string }>;
};

function createReadOnlyServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Admissions preview is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { showId } = await context.params;
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug")?.trim() ?? "";
    if (!showId?.trim() || !slug) {
      return NextResponse.json({ success: false, error: "Show ID and slug are required." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const hasAdminAccess = verifyAdminSessionCookieValue(
      slug,
      cookieStore.get(getAdminSessionCookieName(slug))?.value,
    );
    if (!hasAdminAccess) {
      return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    }

    const preview = await loadAdmissionsSyncPreview(createReadOnlyServiceClient(), showId, slug);
    return NextResponse.json({ success: true, preview });
  } catch (error) {
    console.error("Admissions sync preview failed.", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to preview admissions sync." },
      { status: 500 },
    );
  }
}

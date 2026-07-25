import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { prepareCheckInList } from "@/lib/prepare-check-in-list";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ showId: string }>;
};

function createAdmissionsServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Prepare Check-In List is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { showId } = await context.params;
    const body = await request.json().catch(() => null) as { slug?: unknown } | null;
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
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

    const result = await prepareCheckInList(createAdmissionsServiceClient(), showId, slug);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Prepare Check-In List failed.", error);
    return NextResponse.json(
      { success: false, error: "Unable to prepare the check-in list." },
      { status: 500 },
    );
  }
}

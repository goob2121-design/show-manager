import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { sendTrackedReservedSeatEmail } from "@/lib/email/send-reserved-seat-link-email";

export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Server database configuration is missing.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { slug?: unknown; linkId?: unknown; resend?: unknown };
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const linkId = typeof body.linkId === "string" ? body.linkId.trim() : "";
    if (!slug || !linkId) return NextResponse.json({ success: false, error: "slug and linkId are required." }, { status: 400 });

    const cookieStore = await cookies();
    if (!verifyAdminSessionCookieValue(slug, cookieStore.get(getAdminSessionCookieName(slug))?.value)) {
      return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    }

    const supabase = serviceClient();
    const { data: show } = await supabase.from("shows").select("id").eq("slug", slug).maybeSingle();
    const { data: link } = await supabase.from("show_reserved_seating_links").select("show_id").eq("id", linkId).maybeSingle();
    if (!show || !link || show.id !== link.show_id) return NextResponse.json({ success: false, error: "Reserved seating link was not found for this show." }, { status: 404 });

    const result = await sendTrackedReservedSeatEmail(supabase, linkId, { allowResend: body.resend === true });
    return NextResponse.json(result, { status: result.success ? 200 : 502 });
  } catch (error) {
    console.error("Reserved-seat email route failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to send reserved-seat email." }, { status: 500 });
  }
}

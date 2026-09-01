import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { validatePresaleAccess } from "@/lib/presale-access";

export const runtime = "nodejs";

const ALLOWED_ORIGINS = new Set(["https://www.cumberlandmountainmusic.com", "https://cumberlandmountainmusic.com"]);
const attempts = new Map<string, number[]>();

function cors(origin: string | null): Record<string, string> {
  return origin && ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}
function responseHeaders(origin: string | null) {
  return { ...cors(origin), "Cache-Control": "no-store" };
}
function limited(key: string) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < 60_000);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > 8;
}
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Presale access is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: { ...cors(request.headers.get("origin")), "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const origin = request.headers.get("origin");
  const headers = responseHeaders(origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return NextResponse.json({ valid: false }, { status: 403, headers });
  const { slug } = await params;
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(`${clientKey}:${slug}`)) return NextResponse.json({ valid: false }, { status: 429, headers: { ...headers, "Retry-After": "60" } });

  try {
    const body = await request.json() as Record<string, unknown>;
    const { data, error } = await db().from("shows")
      .select("id,ticket_link,ticket_sale_status,presale_starts_at,public_sale_starts_at,presale_access_code")
      .eq("slug", slug).eq("is_archived", false).maybeSingle();
    if (error) throw error;
    if (!data || !validatePresaleAccess(data, body.code)) return NextResponse.json({ valid: false }, { headers });
    const ticketUrl = data.ticket_link?.trim() ?? "";
    if (!/^https:\/\//i.test(ticketUrl)) return NextResponse.json({ valid: false }, { headers });
    return NextResponse.json({ valid: true, ticketUrl }, { headers });
  } catch {
    return NextResponse.json({ valid: false }, { headers });
  }
}

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { effectiveTicketSaleStatus } from "@/lib/ticket-sale-status";

export const runtime = "nodejs";

const ALLOWED_ORIGINS = new Set([
  "https://www.cumberlandmountainmusic.com",
  "https://cumberlandmountainmusic.com",
]);

const CACHE_CONTROL = "no-store";

function cors(origin: string | null): Record<string, string> {
  return origin && ALLOWED_ORIGINS.has(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : {};
}

function responseHeaders(origin: string | null) {
  return { ...cors(origin), "Cache-Control": CACHE_CONTROL };
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Ticket sale status is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...cors(request.headers.get("origin")),
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = responseHeaders(origin);

  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await db()
      .from("shows")
      .select("slug,name,show_date,ticket_sale_status,presale_starts_at,public_sale_starts_at")
      .eq("is_archived", false)
      .gte("show_date", today)
      .order("show_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ show: null, ticketSales: null }, { headers });

    return NextResponse.json({
      show: { slug: data.slug, name: data.name, date: data.show_date },
      ticketSales: {
        status: effectiveTicketSaleStatus(data),
        presaleStartsAt: data.presale_starts_at,
        publicSaleStartsAt: data.public_sale_starts_at,
      },
    }, { headers });
  } catch (error) {
    console.error("Public ticket sale status lookup failed.", error);
    return NextResponse.json(
      { show: null, ticketSales: null },
      { status: 503, headers: { ...headers, "Cache-Control": "no-store" } },
    );
  }
}

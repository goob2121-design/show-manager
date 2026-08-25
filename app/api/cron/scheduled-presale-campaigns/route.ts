import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processDueScheduledPresaleCampaigns } from "@/lib/scheduled-presale-campaign";

export const runtime = "nodejs";
function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE; if (!url || !key) throw new Error("Scheduled campaigns are not configured."); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ success: false }, { status: 401 });
  try {
    const results = await processDueScheduledPresaleCampaigns({ supabase: serviceClient(), origin: request.nextUrl.origin, apiKey: process.env.RESEND_API_KEY });
    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error) { console.error("Scheduled presale cron failed.", { message: error instanceof Error ? error.message : "Unknown error" }); return NextResponse.json({ success: false, error: "Scheduled campaign processing failed." }, { status: 500 }); }
}

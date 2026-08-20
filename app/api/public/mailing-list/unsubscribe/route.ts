import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyMailingListUnsubscribeToken } from "@/lib/mailing-list";

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json() as Record<string, unknown>; const token = typeof raw.token === "string" ? raw.token : "";
    const id = verifyMailingListUnsubscribeToken(token);
    if (!id) return NextResponse.json({ success: false, error: "This unsubscribe link is invalid." }, { status: 400 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !key) throw new Error("Mailing list is not configured.");
    const now = new Date().toISOString();
    const { error } = await createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).from("mailing_list_subscribers")
      .update({ status: "unsubscribed", unsubscribed_at: now, updated_at: now }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mailing-list unsubscribe failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to update this subscription." }, { status: 500 });
  }
}

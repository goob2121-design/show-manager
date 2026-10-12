import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ showId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { showId } = await context.params;
    const supabase = createServiceSupabaseClient();
    const [{ count, error: countError }, { data: links, error: linksError }] = await Promise.all([
      supabase.from("show_reserved_seat_assignments").select("id", { count: "exact", head: true }).eq("show_id", showId).eq("assignment_type", "customer"),
      supabase.from("show_reserved_seating_links").select("id,ticket_count,is_complimentary,seat_category").eq("show_id", showId),
    ]);
    if (countError) throw countError;
    if (linksError) throw linksError;
    return NextResponse.json({ success: true, reservedSeatsAssigned: count ?? 0, reservedLinks: links ?? [] });
  } catch (error) {
    console.error("Public reserved seating summary failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to load reserved seating totals." }, { status: 500 });
  }
}

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { ReservedSeatPreference } from "@/lib/types";
import { splitMailingListFullName, subscribeMailingListContact } from "@/lib/mailing-list-subscription";

export const runtime = "nodejs";

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Seat preference updates are not configured.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { token?: unknown; preference?: unknown; mailingListOptIn?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const preference = body.preference as ReservedSeatPreference;
    if (!token || !["customer_select", "auto_assign"].includes(preference)) {
      return NextResponse.json({ success: false, error: "A valid reservation token and seat preference are required." }, { status: 400 });
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data: link, error: linkError } = await supabase
      .from("show_reserved_seating_links")
      .select("id,submitted_at,email,customer_name")
      .eq("selection_token", token)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) return NextResponse.json({ success: false, error: "Reservation was not found." }, { status: 404 });

    const { count, error: assignmentError } = await supabase
      .from("show_reserved_seat_assignments")
      .select("id", { count: "exact", head: true })
      .eq("seating_link_id", link.id);
    if (assignmentError) throw assignmentError;
    if (link.submitted_at || (count ?? 0) > 0) {
      return NextResponse.json({ success: false, error: "Seat preference can no longer be changed because seats have been assigned." }, { status: 409 });
    }

    const { error: updateError } = await supabase
      .from("show_reserved_seating_links")
      .update({ seat_preference: preference })
      .eq("id", link.id);
    if (updateError) throw updateError;

    let mailingListSubscribed = false;
    if (preference === "auto_assign" && body.mailingListOptIn === true && link.email?.trim()) {
      try {
        const names = splitMailingListFullName(link.customer_name);
        const subscription = await subscribeMailingListContact(supabase, {
          email: link.email,
          ...names,
          source: "ticket_opt_in",
          confirmResubscribe: true,
        });
        mailingListSubscribed = subscription.status !== "resubscribe_required";
      } catch (error) {
        console.error("Mailing-list opt-in failed after no-seat-selected preference commit.", {
          reservationId: link.id,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({ success: true, data: { seatPreference: preference, mailingListSubscribed } });
  } catch (error) {
    console.error("Customer seat preference update failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to save your seat preference right now." }, { status: 500 });
  }
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName } from "@/lib/admin-session";
import {
  deriveReservedSeatEmailTrackingSummary,
  type ReservedSeatEmailEventRecord,
} from "@/lib/reserved-seat-email-tracking";
import { validateReservedSeatEmailStatusAccess } from "@/lib/reserved-seat-email-status-auth";

export const runtime = "nodejs";

type ReservedSeatEmailStatusRouteContext = {
  params: Promise<{ showId: string }>;
};

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Reserved-seat email status lookup is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: Request, context: ReservedSeatEmailStatusRouteContext) {
  try {
    const { showId } = await context.params;
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug")?.trim() ?? "";

    const supabase = createServiceRoleSupabaseClient();
    const { data: show, error: showError } = await supabase
      .from("shows")
      .select("id,slug")
      .eq("id", showId)
      .maybeSingle();

    if (showError) {
      throw showError;
    }

    const cookieStore = await cookies();
    const accessResult = validateReservedSeatEmailStatusAccess({
      requestedShowId: showId,
      requestedSlug: slug,
      canonicalShow: show ? { id: show.id, slug: show.slug } : null,
      cookieValue: show?.slug ? cookieStore.get(getAdminSessionCookieName(show.slug))?.value : undefined,
    });
    if (!accessResult.ok) {
      return NextResponse.json({ success: false, error: accessResult.error }, { status: accessResult.status });
    }

    const { data: links, error: linksError } = await supabase
      .from("show_reserved_seating_links")
      .select("id,resend_email_id,sent_at,email_attempt_count,last_email_error")
      .eq("show_id", accessResult.showId);

    if (linksError) {
      throw linksError;
    }

    const linkIds = (links ?? []).map((link) => link.id);
    const { data: events, error: eventsError } = linkIds.length > 0
      ? await supabase
        .from("reserved_seat_email_events")
        .select("id,resend_email_id,reserved_seating_link_id,event_type,event_created_at,received_at,recipient,click_target,raw_event_id")
        .in("reserved_seating_link_id", linkIds)
        .order("event_created_at", { ascending: true })
      : { data: [], error: null };

    if (eventsError) {
      throw eventsError;
    }

    const eventMap = new Map<string, ReservedSeatEmailEventRecord[]>();
    for (const event of (events ?? []) as ReservedSeatEmailEventRecord[]) {
      const linkId = event.reserved_seating_link_id;
      if (!linkId) continue;
      const list = eventMap.get(linkId) ?? [];
      list.push(event);
      eventMap.set(linkId, list);
    }

    return NextResponse.json({
      success: true,
      statuses: (links ?? []).map((link) => ({
        reservedSeatingLinkId: link.id,
        attempts: link.email_attempt_count ?? 0,
        lastEmailError: link.last_email_error ?? null,
        ...deriveReservedSeatEmailTrackingSummary({
          sentAt: link.sent_at ?? null,
          resendEmailId: link.resend_email_id ?? null,
          events: eventMap.get(link.id) ?? [],
        }),
      })),
    });
  } catch (error) {
    console.error("Reserved-seat email status lookup failed.", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Unable to load reserved-seat email status." },
      { status: 500 },
    );
  }
}

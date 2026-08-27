import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName } from "@/lib/admin-session";
import {
  deriveReservedSeatEmailTrackingSummary,
  type ReservedSeatEmailEventRecord,
} from "@/lib/reserved-seat-email-tracking";
import { validateReservedSeatEmailStatusAccess } from "@/lib/reserved-seat-email-status-auth";
import { resolveReservedSeatRecipientEmail } from "@/lib/email/resolve-reserved-seat-recipient";

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
      .select("id,show_id,customer_name,email,source_ticket_id,source_show_sponsor_id,is_complimentary,seat_category,resend_email_id,sent_at,email_attempt_count,last_email_error")
      .eq("show_id", accessResult.showId);

    if (linksError) {
      throw linksError;
    }

    const linkIds = (links ?? []).map((link) => link.id);
    const [{ data: deliveries, error: deliveriesError }, { data: events, error: eventsError }] = await Promise.all([
      supabase.from("reserved_seat_email_deliveries").select("id,reserved_seating_link_id,email_type,sequence_number,subject,resend_email_id,send_status,sent_at,failed_at,error_message,created_at").eq("show_id", accessResult.showId).order("created_at", { ascending: true }),
      linkIds.length > 0
        ? supabase.from("reserved_seat_email_events").select("id,resend_email_id,reserved_seating_link_id,email_delivery_id,event_type,event_created_at,received_at,recipient,click_target,raw_event_id").in("reserved_seating_link_id", linkIds).order("event_created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (deliveriesError) throw deliveriesError;
    if (eventsError) throw eventsError;

    type EventWithDelivery = ReservedSeatEmailEventRecord & { email_delivery_id: string | null };
    const eventMap = new Map<string, EventWithDelivery[]>();
    const deliveryEventMap = new Map<string, EventWithDelivery[]>();
    for (const event of (events ?? []) as EventWithDelivery[]) {
      if (event.reserved_seating_link_id) {
        const list = eventMap.get(event.reserved_seating_link_id) ?? [];
        list.push(event);
        eventMap.set(event.reserved_seating_link_id, list);
      }
      if (event.email_delivery_id) {
        const list = deliveryEventMap.get(event.email_delivery_id) ?? [];
        list.push(event);
        deliveryEventMap.set(event.email_delivery_id, list);
      }
    }

    const deliveriesByLink = new Map<string, NonNullable<typeof deliveries>>();
    for (const delivery of deliveries ?? []) {
      if (!delivery.reserved_seating_link_id) continue;
      const list = deliveriesByLink.get(delivery.reserved_seating_link_id) ?? [];
      list.push(delivery);
      deliveriesByLink.set(delivery.reserved_seating_link_id, list);
    }

    const resolvedRecipientEmails = new Map(await Promise.all((links ?? []).map(async (link) => [
      link.id,
      await resolveReservedSeatRecipientEmail(supabase, {
        showId: link.show_id, customerName: link.customer_name, email: link.email,
        sourceTicketId: link.source_ticket_id, sourceShowSponsorId: link.source_show_sponsor_id,
        isComplimentary: link.is_complimentary, seatCategory: link.seat_category,
      }),
    ] as const)));

    return NextResponse.json({
      success: true,
      statuses: (links ?? []).map((link) => {
        const allEvents = eventMap.get(link.id) ?? [];
        const deliveryHistory = (deliveriesByLink.get(link.id) ?? []).map((delivery) => ({
          id: delivery.id,
          emailType: delivery.email_type,
          sequenceNumber: delivery.sequence_number,
          label: delivery.email_type === "reserved_seat_initial"
            ? "Original Email"
            : delivery.email_type === "reserved_seat_resend"
              ? `Resent Original #${delivery.sequence_number}`
              : `Reminder #${delivery.sequence_number}`,
          subject: delivery.subject,
          sendStatus: delivery.send_status,
          sentAt: delivery.sent_at,
          failedAt: delivery.failed_at,
          errorMessage: delivery.error_message,
          ...deriveReservedSeatEmailTrackingSummary({ sentAt: delivery.sent_at, resendEmailId: delivery.resend_email_id, events: deliveryEventMap.get(delivery.id) ?? [] }),
        }));
        if (!deliveryHistory.some((delivery) => delivery.emailType === "reserved_seat_initial") && (link.sent_at || link.resend_email_id)) {
          deliveryHistory.unshift({
            id: `legacy-${link.id}`,
            emailType: "reserved_seat_initial",
            sequenceNumber: 0,
            label: "Original Email",
            subject: "Select Your Reserved Seats - The Cumberland Mountain Music Show",
            sendStatus: "accepted",
            sentAt: link.sent_at,
            failedAt: null,
            errorMessage: link.last_email_error,
            ...deriveReservedSeatEmailTrackingSummary({ sentAt: link.sent_at, resendEmailId: link.resend_email_id, events: allEvents.filter((event) => event.email_delivery_id === null) }),
          });
        }
        return {
          reservedSeatingLinkId: link.id,
          resolvedRecipientEmail: resolvedRecipientEmails.get(link.id) ?? null,
          attempts: link.email_attempt_count ?? 0,
          lastEmailError: link.last_email_error ?? null,
          deliveries: deliveryHistory,
          ...deriveReservedSeatEmailTrackingSummary({ sentAt: link.sent_at ?? null, resendEmailId: link.resend_email_id ?? null, events: allEvents }),
        };
      }),
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

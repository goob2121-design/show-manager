import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { isReservedChildSeatsEnabled } from "@/lib/reserved-child-seats";
import { deliverOfficialTicketEmail } from "@/lib/email/official-ticket-email";
import { splitMailingListFullName, subscribeMailingListContact } from "@/lib/mailing-list-subscription";
import { RESERVED_SEAT_DEFINITIONS, RESERVED_SEATING_VENUE, sortReservedSeatIds } from "@/lib/reserved-seating";
import type { ShowRecord, ShowReservedSeatingLink } from "@/lib/types";

export const runtime = "nodejs";

const defaultFromAddress = "onboarding@resend.dev";

type SubmitReservedSeatsRequestBody = {
  token?: unknown;
  seatIds?: unknown;
  mailingListOptIn?: unknown;
  confirmFamily?: unknown;
  childSeatIds?: unknown;
};

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing server-side Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatShowDateTime(showDate: string | null, showStartTime: string | null) {
  const parts: string[] = [];

  if (showDate) {
    parts.push(
      new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${showDate}T00:00:00`)),
    );
  }

  if (showStartTime?.trim()) {
    parts.push(showStartTime.trim());
  }

  return parts.join(" at ") || "Date TBD";
}

function getSiteBaseUrl() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return configuredSiteUrl ? configuredSiteUrl.replace(/\/+$/, "") : "";
}

function buildAdminShowUrl(showSlug: string | null) {
  if (!showSlug) {
    return null;
  }

  const adminPath = `/admin/${encodeURIComponent(showSlug)}`;
  const siteBaseUrl = getSiteBaseUrl();
  return siteBaseUrl ? `${siteBaseUrl}${adminPath}` : adminPath;
}

async function sendReservedSeatingAdminNotification(payload: {
  customerName: string;
  customerEmail: string | null;
  seatIds: string[];
  ticketCount: number;
  showName: string;
  showDateTime: string;
  venueName: string;
  adminUrl: string | null;
  childSeatIds?: string[];
  idempotencyKey?: string;
}) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("Reserved seating admin notification skipped: RESEND_API_KEY is not configured.");
      return;
    }

    if (!process.env.NOTIFY_EMAIL) {
      console.error("Reserved seating admin notification skipped: NOTIFY_EMAIL is not configured.");
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const escapedCustomerName = escapeHtml(payload.customerName);
    const escapedShowName = escapeHtml(payload.showName);
    const escapedShowDateTime = escapeHtml(payload.showDateTime);
    const escapedSeatIds = escapeHtml(payload.seatIds.join(", "));
    const escapedVenueName = escapeHtml(payload.venueName);
    const escapedCustomerEmail = payload.customerEmail?.trim() ? escapeHtml(payload.customerEmail.trim()) : null;
    const escapedAdminUrl = payload.adminUrl ? escapeHtml(payload.adminUrl) : null;
    const subject = `Reserved seats selected - ${payload.customerName}`;

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
        <p><strong>${escapedCustomerName}</strong> has selected reserved seats for ${escapedShowName}.</p>
        <p><strong>Selected seats:</strong><br />${escapedSeatIds}</p>
        <p><strong>Show:</strong><br />${escapedShowDateTime}</p>
        <p><strong>Customer email:</strong><br />${escapedCustomerEmail ?? "Not provided"}</p>
        <p><strong>Seat count:</strong><br />${payload.ticketCount}</p>
        ${payload.childSeatIds ? `<p><strong>Paid seats:</strong> ${payload.ticketCount}<br /><strong>Free child seats:</strong> ${payload.childSeatIds.length}<br /><strong>Total occupied seats:</strong> ${payload.seatIds.length}<br /><strong>Children's seats:</strong> ${escapeHtml(payload.childSeatIds.join(", ")) || "None"}</p>` : ""}
        <p><strong>Venue:</strong><br />${escapedVenueName}</p>
        ${escapedAdminUrl ? `<p><strong>Admin Reserved Seating:</strong><br /><a href="${escapedAdminUrl}">${escapedAdminUrl}</a></p>` : ""}
      </div>
    `.trim();

    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || defaultFromAddress,
      to: process.env.NOTIFY_EMAIL,
      subject,
      html,
    }, payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : undefined);

    if (error) {
      console.error("Reserved seating admin notification failed while sending with Resend.", error);
    }
  } catch (error) {
    console.error("Reserved seating admin notification failed unexpectedly.", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SubmitReservedSeatsRequestBody;
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const seatIds = Array.isArray(body.seatIds)
      ? body.seatIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim())
      : [];

    if (!token) {
      return NextResponse.json({ success: false, error: "Token is required." }, { status: 400 });
    }

    const uniqueSeatIds = sortReservedSeatIds(Array.from(new Set(seatIds)));

    if (uniqueSeatIds.length === 0) {
      return NextResponse.json({ success: false, error: "Select at least one seat." }, { status: 400 });
    }

    const invalidSeatId = uniqueSeatIds.find((seatId) => !RESERVED_SEAT_DEFINITIONS.some((seat) => seat.seatId === seatId));
    if (invalidSeatId) {
      return NextResponse.json({ success: false, error: `Invalid seat: ${invalidSeatId}` }, { status: 400 });
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data: seatingLink, error: seatingLinkError } = await supabase
      .from("show_reserved_seating_links")
      .select("*")
      .eq("selection_token", token)
      .maybeSingle();

    const typedSeatingLink = seatingLink as ShowReservedSeatingLink | null;

    if (seatingLinkError || !typedSeatingLink) {
      return NextResponse.json({ success: false, error: "Reserved seating link not found." }, { status: 404 });
    }

    const combined = body.confirmFamily === true;
    let childSeatIds: string[] = [];
    let submittedAt = new Date().toISOString();
    if (combined) {
      if (!isReservedChildSeatsEnabled()) return NextResponse.json({ success: false, error: "Family seating is not available." }, { status: 403 });
      if (!Array.isArray(body.childSeatIds) || body.childSeatIds.some((id) => typeof id !== "string")) {
        return NextResponse.json({ success: false, error: "Invalid children's seats." }, { status: 400 });
      }
      childSeatIds = sortReservedSeatIds(body.childSeatIds as string[]);
    }
    // Both RPCs lock the same reservation before inspecting or writing assignments.
    const { data, error } = await supabase.rpc(combined ? "confirm_reserved_family_seats" : "confirm_reserved_seats", {
      p_selection_token: token, p_paid_seat_ids: seatIds, ...(combined ? { p_child_seat_ids: childSeatIds } : {}),
    });
    if (error) return NextResponse.json({ success: false, error: "Unable to confirm seats. Please try again or contact the show." }, { status: 503 });
    const result = data?.[0];
    if (!result || !["CONFIRMED", "ALREADY_CONFIRMED"].includes(result.result_status)) {
      return NextResponse.json({ success: false, error: `Seats could not be confirmed (${result?.result_status || "UNKNOWN"}). Please review your selection.` }, { status: 409 });
    }
    submittedAt = result.submitted_at;
    if (result.result_status === "ALREADY_CONFIRMED") {
      return NextResponse.json({ success: true, data: {
        seatIds: sortReservedSeatIds([...seatIds, ...childSeatIds]), paidSeatIds: seatIds, childSeatIds,
        submittedAt, ticketEmailMessage: "Your reservation was already confirmed. No additional emails were sent.",
      } });
    }

    let mailingListSubscribed = false;
    if (body.mailingListOptIn === true && typedSeatingLink.email?.trim()) {
      try {
        const names = splitMailingListFullName(typedSeatingLink.customer_name);
        const subscription = await subscribeMailingListContact(supabase, {
          email: typedSeatingLink.email,
          ...names,
          source: "ticket_opt_in",
          confirmResubscribe: true,
        });
        mailingListSubscribed = subscription.status !== "resubscribe_required";
      } catch (error) {
        console.error("Mailing-list opt-in failed after reserved-seat assignment commit.", {
          reservationId: typedSeatingLink.id,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    let ticketEmailDelivered = false;
    let ticketEmailMessage: string | null = null;
    try {
      const ticketEmailResult = await deliverOfficialTicketEmail(supabase, typedSeatingLink.id, {
        requestOrigin: request.nextUrl.origin,
        idempotencyKey: `family-initial/customer/${typedSeatingLink.id}/${submittedAt}`,
      });
      ticketEmailDelivered = ticketEmailResult.success;
      if (!ticketEmailResult.success) {
        ticketEmailMessage = "Your seats are confirmed, but we could not deliver the ticket email automatically. You can send it again from this page.";
      }
    } catch (error) {
      ticketEmailMessage = "Your seats are confirmed, but we could not deliver the ticket email automatically. You can send it again from this page.";
      console.error("Automatic official ticket email failed after reservation commit.", {
        reservationId: typedSeatingLink.id,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
    const { data: showRecord, error: showError } = await supabase
      .from("shows")
      .select("slug, name, show_date, show_start_time")
      .eq("id", typedSeatingLink.show_id)
      .maybeSingle();

    if (showError) {
      console.error("Reserved seating notification show lookup failed.", showError);
    }

    const typedShow = (showRecord ?? null) as Pick<ShowRecord, "slug" | "name" | "show_date" | "show_start_time"> | null;

    await sendReservedSeatingAdminNotification({
      customerName: typedSeatingLink.customer_name,
      customerEmail: typedSeatingLink.email,
      seatIds: sortReservedSeatIds([...uniqueSeatIds, ...childSeatIds]),
      childSeatIds: combined ? childSeatIds : undefined,
      idempotencyKey: `family-initial/admin/${typedSeatingLink.id}/${submittedAt}`,
      ticketCount: typedSeatingLink.ticket_count,
      showName: typedShow?.name?.trim() || "Cumberland Mountain Music Show",
      showDateTime: formatShowDateTime(typedShow?.show_date ?? null, typedShow?.show_start_time ?? null),
      venueName: RESERVED_SEATING_VENUE.venueName,
      adminUrl: buildAdminShowUrl(typedShow?.slug ?? null),
    });

    return NextResponse.json({
      success: true,
      data: {
        seatIds: sortReservedSeatIds([...uniqueSeatIds, ...childSeatIds]),
        paidSeatIds: uniqueSeatIds,
        childSeatIds,
        submittedAt,
        ticketEmailDelivered,
        ticketEmailMessage,
        mailingListSubscribed,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unable to submit reserved seats.",
      },
      { status: 500 },
    );
  }
}

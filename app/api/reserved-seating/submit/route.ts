import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { RESERVED_SEAT_DEFINITIONS, RESERVED_SEATING_VENUE, formatReservedSeatLabel, getReservedSeatDefinition, sortReservedSeatIds } from "@/lib/reserved-seating";
import type { ShowRecord, ShowReservedSeatingLink } from "@/lib/types";

export const runtime = "nodejs";

const defaultFromAddress = "onboarding@resend.dev";

type SubmitReservedSeatsRequestBody = {
  token?: unknown;
  seatIds?: unknown;
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
        <p><strong>Venue:</strong><br />${escapedVenueName}</p>
        ${escapedAdminUrl ? `<p><strong>Admin Reserved Seating:</strong><br /><a href="${escapedAdminUrl}">${escapedAdminUrl}</a></p>` : ""}
      </div>
    `.trim();

    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || defaultFromAddress,
      to: process.env.NOTIFY_EMAIL,
      subject,
      html,
    });

    if (error) {
      console.error("Reserved seating admin notification failed while sending with Resend.", error);
    }
  } catch (error) {
    console.error("Reserved seating admin notification failed unexpectedly.", error);
  }
}

export async function POST(request: Request) {
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

    if (typedSeatingLink.submitted_at) {
      return NextResponse.json({ success: false, error: "This reserved seating link has already been used." }, { status: 409 });
    }

    if (uniqueSeatIds.length > typedSeatingLink.ticket_count) {
      return NextResponse.json(
        {
          success: false,
          error: `You may only reserve up to ${typedSeatingLink.ticket_count} seat${typedSeatingLink.ticket_count === 1 ? "" : "s"}.`,
        },
        { status: 400 },
      );
    }

    const { data: existingAssignments, error: existingAssignmentsError } = await supabase
      .from("show_reserved_seat_assignments")
      .select("seat_id, seating_link_id, assignment_type")
      .eq("show_id", typedSeatingLink.show_id)
      .in("seat_id", uniqueSeatIds);

    if (existingAssignmentsError) {
      return NextResponse.json({ success: false, error: existingAssignmentsError.message }, { status: 500 });
    }

    const blockedAssignment = (existingAssignments ?? []).find((assignment) => assignment.assignment_type === "blocked");
    if (blockedAssignment) {
      return NextResponse.json(
        {
          success: false,
          error: `${formatReservedSeatLabel(blockedAssignment.seat_id ?? "")} is unavailable.`,
        },
        { status: 409 },
      );
    }

    const conflictingAssignment = (existingAssignments ?? []).find(
      (assignment) => assignment.assignment_type !== "blocked" && assignment.seating_link_id !== typedSeatingLink.id,
    );

    if (conflictingAssignment) {
      return NextResponse.json(
        {
          success: false,
          error: `${formatReservedSeatLabel(conflictingAssignment.seat_id ?? "")} is no longer available.`,
        },
        { status: 409 },
      );
    }

    const resolvedSeatCategory = typedSeatingLink.seat_category?.trim() || (typedSeatingLink.is_complimentary ? "comp" : "paid_reserved");

    const assignmentRows = uniqueSeatIds.map((seatId) => {
      const definition = getReservedSeatDefinition(seatId);
      return {
        show_id: typedSeatingLink.show_id,
        seating_link_id: typedSeatingLink.id,
        customer_name: typedSeatingLink.customer_name,
        email: typedSeatingLink.email,
        seat_id: seatId,
        section: definition?.section ?? seatId.slice(0, 1),
        row_label: definition?.rowLabel ?? seatId.slice(2, 3),
        seat_number: definition?.seatNumber ?? 0,
        assignment_type: "customer",
        seat_category: resolvedSeatCategory,
      };
    });

    const { error: insertError } = await supabase.from("show_reserved_seat_assignments").insert(assignmentRows);

    if (insertError) {
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    const submittedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("show_reserved_seating_links")
      .update({ submitted_at: submittedAt, sent_at: typedSeatingLink.sent_at ?? submittedAt, selection_mode: "customer" })
      .eq("id", typedSeatingLink.id);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
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
      seatIds: uniqueSeatIds,
      ticketCount: typedSeatingLink.ticket_count,
      showName: typedShow?.name?.trim() || "Cumberland Mountain Music Show",
      showDateTime: formatShowDateTime(typedShow?.show_date ?? null, typedShow?.show_start_time ?? null),
      venueName: RESERVED_SEATING_VENUE.venueName,
      adminUrl: buildAdminShowUrl(typedShow?.slug ?? null),
    });

    return NextResponse.json({
      success: true,
      data: {
        seatIds: uniqueSeatIds,
        submittedAt,
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

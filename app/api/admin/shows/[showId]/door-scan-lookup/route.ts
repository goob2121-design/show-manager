import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  classifyReservedScanAdmission,
  formatDoorScanSeatLabels,
  normalizeScannedReservationToken,
  type DoorModeScanLookupResponse,
  type DoorModeScanLookupTicket,
} from "@/lib/door-mode-scan";
import { getAdminSessionCookieName } from "@/lib/admin-session";
import { resolveDoorAccess } from "@/lib/door-access";
import { getDoorStaffSessionCookieName } from "@/lib/door-staff-session";
import type { ShowReservedSeatingLink } from "@/lib/types";
import { isSponsorCompRedemptionToken, type SponsorCompRedemptionResult } from "@/lib/sponsor-comp-redemption-tokens";

export const runtime = "nodejs";

interface DoorScanLookupRouteContext {
  params: Promise<{ showId: string }>;
}

function createReadOnlyServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Door Mode scan lookup is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type LookupLinkRow = Pick<
  ShowReservedSeatingLink,
  "id" | "show_id" | "customer_name" | "ticket_count" | "is_complimentary" | "seat_category" | "source_ticket_id" | "submitted_at"
>;

async function loadLookupTicket(
  supabase: ReturnType<typeof createReadOnlyServiceClient>,
  showId: string,
  link: LookupLinkRow,
) {
  let ticketId = link.source_ticket_id ?? null;

  if (!ticketId) {
    const { data: projectionData, error: projectionError } = await supabase
      .from("show_admission_projection_sources")
      .select("projected_ticket_id")
      .eq("show_id", showId)
      .eq("source_type", "reserved_link")
      .eq("source_id", link.id)
      .maybeSingle();
    if (projectionError) throw projectionError;
    ticketId = (projectionData as { projected_ticket_id: string } | null)?.projected_ticket_id ?? null;
  }

  if (!ticketId) {
    return null;
  }

  const { data: ticketData, error: ticketError } = await supabase
    .from("show_comp_tickets")
    .select("id, show_id, guest_name, ticket_count, ticket_type, notes, checked_in, checked_in_count, created_at")
    .eq("show_id", showId)
    .eq("id", ticketId)
    .maybeSingle();
  if (ticketError) throw ticketError;
  return (ticketData as DoorModeScanLookupTicket | null) ?? null;
}

export async function POST(request: Request, context: DoorScanLookupRouteContext) {
  try {
    const { showId } = await context.params;
    const body = (await request.json().catch(() => null)) as { slug?: string; scannedToken?: string } | null;
    const requestedSlug = body?.slug?.trim() ?? "";
    const normalizedToken = normalizeScannedReservationToken(body?.scannedToken);

    if (!showId?.trim() || !requestedSlug) {
      return NextResponse.json({ success: false, error: "Show ID and slug are required." } satisfies DoorModeScanLookupResponse, { status: 400 });
    }

    if (!normalizedToken) {
      return NextResponse.json({ success: false, error: "Invalid ticket code." } satisfies DoorModeScanLookupResponse, { status: 400 });
    }

    const supabase = createReadOnlyServiceClient();
    const { data: showData, error: showError } = await supabase
      .from("shows")
      .select("id, slug")
      .eq("id", showId)
      .maybeSingle();
    if (showError) throw showError;

    const cookieStore = await cookies();
    const show = showData as { id: string; slug: string } | null;
    if (!show || show.slug !== requestedSlug) {
      return NextResponse.json({ success: false, error: "Show not found." } satisfies DoorModeScanLookupResponse, { status: 404 });
    }
    const accessRole = resolveDoorAccess({
      slug: show.slug,
      showId: show.id,
      adminCookieValue: cookieStore.get(getAdminSessionCookieName(show.slug))?.value,
      doorStaffCookieValue: cookieStore.get(getDoorStaffSessionCookieName(show.slug))?.value,
    });
    if (!accessRole) {
      return NextResponse.json({ success: false, error: "Door Mode access is required." } satisfies DoorModeScanLookupResponse, { status: 401 });
    }

    if (isSponsorCompRedemptionToken(normalizedToken)) {
      const { data, error } = await supabase.rpc("redeem_sponsor_comp_redemption_token", {
        p_show_id: show.id, p_show_slug: show.slug, p_token: normalizedToken, p_redeemed_by: accessRole,
      });
      if (error) throw error;
      const row = (data as Array<Record<string, unknown>> | null)?.[0];
      if (!row || row.result_status === "WRONG_SHOW") {
        return NextResponse.json({ success: true, result: { kind: "not_found" } } satisfies DoorModeScanLookupResponse);
      }
      const redemption: SponsorCompRedemptionResult = {
        resultStatus: row.result_status as SponsorCompRedemptionResult["resultStatus"],
        tokenId: row.token_id as string | null,
        showSponsorId: row.show_sponsor_id as string | null,
        sponsorName: row.sponsor_name as string | null,
        ordinal: row.ordinal as number | null,
        allowance: row.allowance as number | null,
        checkedIn: row.checked_in as number | null,
        remaining: row.remaining as number | null,
        redeemedAt: row.redeemed_at as string | null,
      };
      return NextResponse.json({
        success: true,
        result: { kind: "sponsor_comp_redemption", redemption },
      } satisfies DoorModeScanLookupResponse);
    }

    const { data: linkData, error: linkError } = await supabase
      .from("show_reserved_seating_links")
      .select("id, show_id, customer_name, ticket_count, is_complimentary, seat_category, source_ticket_id, submitted_at")
      .eq("show_id", show.id)
      .eq("scan_token", normalizedToken)
      .maybeSingle();
    if (linkError) throw linkError;

    const link = linkData as LookupLinkRow | null;
    if (!link) {
      return NextResponse.json({ success: true, result: { kind: "not_found" } } satisfies DoorModeScanLookupResponse);
    }

    const [{ data: assignmentData, error: assignmentError }, ticket] = await Promise.all([
      supabase
        .from("show_reserved_seat_assignments")
        .select("seat_id")
        .eq("show_id", show.id)
        .eq("seating_link_id", link.id),
      loadLookupTicket(supabase, show.id, link),
    ]);
    if (assignmentError) throw assignmentError;

    const admission = classifyReservedScanAdmission(link, ticket);
    const seatLabels = formatDoorScanSeatLabels(
      ((assignmentData ?? []) as Array<{ seat_id: string }>).map((assignment) => assignment.seat_id),
    );

    return NextResponse.json({
      success: true,
      result: {
        kind: "found",
        reservation: {
          id: link.id,
          customerName: link.customer_name,
          ticketCount: link.ticket_count,
          seatLabels,
          admissionLabel: admission.admissionLabel,
          reservationCategory: admission.reservationCategory,
          submittedAt: link.submitted_at,
        },
        ticket,
      },
    } satisfies DoorModeScanLookupResponse);
  } catch (error) {
    console.error("Door Mode scan lookup failed.", error);
    return NextResponse.json(
      { success: false, error: "Unable to scan this ticket right now." } satisfies DoorModeScanLookupResponse,
      { status: 500 },
    );
  }
}

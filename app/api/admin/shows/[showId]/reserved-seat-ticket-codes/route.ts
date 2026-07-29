import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName } from "@/lib/admin-session";
import { generateReservationScanToken } from "@/lib/reservation-scan-tokens";
import { validateReservedSeatEmailStatusAccess } from "@/lib/reserved-seat-email-status-auth";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ showId: string }>;
};

type RequestBody =
  | { slug?: string; action?: "generate-one"; reservationId?: string }
  | { slug?: string; action?: "generate-missing" };

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Reserved seat ticket-code generation is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function authorize(showId: string, requestedSlug: string, supabase: ReturnType<typeof createServiceClient>) {
  const { data: showData, error: showError } = await supabase
    .from("shows")
    .select("id, slug")
    .eq("id", showId)
    .maybeSingle();
  if (showError) throw showError;

  const show = showData as { id: string; slug: string } | null;
  const cookieStore = await cookies();
  return validateReservedSeatEmailStatusAccess({
    requestedShowId: showId,
    requestedSlug,
    canonicalShow: show ? { id: show.id, slug: show.slug } : null,
    cookieValue: show?.slug ? cookieStore.get(getAdminSessionCookieName(show.slug))?.value : undefined,
  });
}

async function assignScanTokenOnce(
  supabase: ReturnType<typeof createServiceClient>,
  showId: string,
  reservationId: string,
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = generateReservationScanToken();
    const { data, error } = await supabase
      .from("show_reserved_seating_links")
      .update({ scan_token: candidate })
      .eq("id", reservationId)
      .eq("show_id", showId)
      .is("scan_token", null)
      .select("id, show_id, scan_token")
      .maybeSingle();

    if (!error && data) {
      return { status: "generated" as const };
    }

    const message = error?.message ?? "";
    if (!error) {
      const { data: current, error: currentError } = await supabase
        .from("show_reserved_seating_links")
        .select("id, scan_token")
        .eq("id", reservationId)
        .eq("show_id", showId)
        .maybeSingle();
      if (currentError) throw currentError;
      if (current?.scan_token) {
        return { status: "already_exists" as const };
      }
      continue;
    }

    if (/scan_token/i.test(message) && /unique/i.test(message)) {
      continue;
    }

    throw error;
  }

  throw new Error("Unable to generate a unique ticket code for this reservation.");
}

export async function POST(request: Request, context: Context) {
  try {
    const { showId } = await context.params;
    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const requestedSlug = body?.slug?.trim() ?? "";
    const action = body?.action;

    if (!showId?.trim() || !requestedSlug || !action) {
      return NextResponse.json({ success: false, error: "Show ID, slug, and action are required." }, { status: 400 });
    }

    const supabase = createServiceClient();
    const access = await authorize(showId, requestedSlug, supabase);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    if (action === "generate-one") {
      const reservationId = "reservationId" in body ? body.reservationId?.trim() ?? "" : "";
      if (!reservationId) {
        return NextResponse.json({ success: false, error: "Reservation ID is required." }, { status: 400 });
      }

      const result = await assignScanTokenOnce(supabase, access.showId, reservationId);
      return NextResponse.json({
        success: true,
        generated: result.status === "generated" ? 1 : 0,
        alreadyHadCode: result.status === "already_exists" ? 1 : 0,
      });
    }

    if (action === "generate-missing") {
      const { data: rows, error } = await supabase
        .from("show_reserved_seating_links")
        .select("id, scan_token")
        .eq("show_id", access.showId);
      if (error) throw error;

      const reservations = (rows ?? []) as Array<{ id: string; scan_token: string | null }>;
      let generated = 0;
      let alreadyHadCode = 0;
      let failed = 0;

      for (const reservation of reservations) {
        if (reservation.scan_token) {
          alreadyHadCode += 1;
          continue;
        }

        try {
          const result = await assignScanTokenOnce(supabase, access.showId, reservation.id);
          if (result.status === "generated") {
            generated += 1;
          } else {
            alreadyHadCode += 1;
          }
        } catch {
          failed += 1;
        }
      }

      return NextResponse.json({
        success: true,
        generated,
        alreadyHadCode,
        skipped: 0,
        failed,
      });
    }

    return NextResponse.json({ success: false, error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    console.error("Reserved seat ticket-code generation failed.", error);
    return NextResponse.json({ success: false, error: "Unable to generate ticket codes." }, { status: 500 });
  }
}

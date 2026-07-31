import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type MarkGuestOpenedRequestBody = {
  guestProfileId?: unknown;
};

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

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

function logGuestPortalOpenedError(context: string, error: unknown) {
  const typedError = error as {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
  } | null;

  console.error(context);
  console.error("Error message:", typedError?.message ?? "no message");
  console.error("Error code:", typedError?.code ?? "no code");
  console.error("Error details:", typedError?.details ?? "no details");
  console.error("Error hint:", typedError?.hint ?? "no hint");
  console.error("Full error JSON:", JSON.stringify(error, null, 2));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MarkGuestOpenedRequestBody;
    const guestProfileId =
      typeof body.guestProfileId === "string" ? body.guestProfileId.trim() : "";

    if (!guestProfileId) {
      return NextResponse.json(
        { success: false, error: "guestProfileId is required." },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data: guestProfile, error: guestProfileError } = await supabase
      .from("guest_profiles")
      .select("id, portal_opened_at")
      .eq("id", guestProfileId)
      .maybeSingle();

    if (guestProfileError) {
      logGuestPortalOpenedError(
        "Guest portal opened route failed to load guest profile.",
        guestProfileError,
      );
      return NextResponse.json(
        { success: false, error: guestProfileError.message, details: guestProfileError },
        { status: 500 },
      );
    }

    if (!guestProfile?.id) {
      return NextResponse.json(
        { success: false, error: "Guest profile not found." },
        { status: 404 },
      );
    }

    if (guestProfile.portal_opened_at) {
      return NextResponse.json({
        success: true,
        updated: false,
        data: guestProfile,
      });
    }

    const { data: updatedGuestProfile, error: updateError } = await supabase
      .from("guest_profiles")
      .update({ portal_opened_at: new Date().toISOString() })
      .eq("id", guestProfile.id)
      .is("portal_opened_at", null)
      .select("id, portal_opened_at")
      .maybeSingle();

    if (updateError) {
      logGuestPortalOpenedError(
        "Guest portal opened route failed to update timestamp.",
        updateError,
      );
      return NextResponse.json(
        { success: false, error: updateError.message, details: updateError },
        { status: 500 },
      );
    }

    if (!updatedGuestProfile?.id) {
      return NextResponse.json(
        { success: false, error: "Guest portal opened timestamp was not updated." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      updated: true,
      data: updatedGuestProfile,
    });
  } catch (error) {
    logGuestPortalOpenedError("Guest portal opened route failed unexpectedly.", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to mark guest portal as opened.",
      },
      { status: 500 },
    );
  }
}

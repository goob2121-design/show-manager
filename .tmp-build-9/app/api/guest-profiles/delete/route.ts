import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type DeleteGuestProfileRequestBody = {
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DeleteGuestProfileRequestBody;
    const guestProfileId =
      typeof body.guestProfileId === "string" ? body.guestProfileId.trim() : "";

    if (!guestProfileId) {
      return NextResponse.json(
        { success: false, error: "guestProfileId is required." },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("guest_profiles")
      .delete()
      .eq("id", guestProfileId)
      .select();

    if (error) {
      console.error("Guest profile delete route failed.", error);
      return NextResponse.json(
        { success: false, error: error.message, details: error },
        { status: 500 },
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: "No guest profile was deleted." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Guest profile delete route failed unexpectedly.", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete guest profile.",
      },
      { status: 500 },
    );
  }
}

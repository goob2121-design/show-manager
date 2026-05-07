import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type DeleteShowRequestBody = {
  showId?: unknown;
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
    const body = (await request.json()) as DeleteShowRequestBody;
    const showId = typeof body.showId === "string" ? body.showId.trim() : "";

    if (!showId) {
      return NextResponse.json(
        { success: false, error: "showId is required." },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase.from("shows").delete().eq("id", showId).select();

    if (error) {
      console.error("Show delete route failed.", error);
      return NextResponse.json(
        { success: false, error: error.message, details: error },
        { status: 500 },
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: "No show was deleted." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Show delete route failed unexpectedly.", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete show.",
      },
      { status: 500 },
    );
  }
}

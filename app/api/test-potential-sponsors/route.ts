import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getPotentialSponsorsTestEnvState() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKeyPrimary = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const serviceRoleKeyFallback = process.env.SUPABASE_SERVICE_ROLE?.trim() ?? "";

  return {
    supabaseUrl,
    serviceRoleKey: serviceRoleKeyPrimary || serviceRoleKeyFallback,
    envPresence: {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(supabaseUrl),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceRoleKeyPrimary),
      SUPABASE_SERVICE_ROLE: Boolean(serviceRoleKeyFallback),
    },
  };
}

function createServiceRoleSupabaseClient() {
  const { supabaseUrl, serviceRoleKey, envPresence } = getPotentialSponsorsTestEnvState();

  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error(
      "Missing server-side Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment.",
    ) as Error & {
      envPresence?: {
        NEXT_PUBLIC_SUPABASE_URL: boolean;
        SUPABASE_SERVICE_ROLE_KEY: boolean;
        SUPABASE_SERVICE_ROLE: boolean;
      };
    };
    error.envPresence = envPresence;
    throw error;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function logPotentialSponsorsTestError(context: string, error: unknown) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const typedError = error as {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
    envPresence?: unknown;
  } | null;

  console.error(context, {
    envPresence: getPotentialSponsorsTestEnvState().envPresence,
    error,
    message: typedError?.message ?? null,
    code: typedError?.code ?? null,
    details: typedError?.details ?? null,
    hint: typedError?.hint ?? null,
    errorEnvPresence: typedError?.envPresence ?? null,
    json: JSON.stringify(error, null, 2),
  });
}

export async function GET() {
  try {
    const supabase = createServiceRoleSupabaseClient();

    const { data: insertResult, error: insertError } = await supabase
      .from("potential_sponsors")
      .insert({
        business_name: "TEST SPONSOR",
        status: "Not Contacted",
      })
      .select("*")
      .single();

    if (insertError) {
      logPotentialSponsorsTestError("Test potential sponsors insert failed.", insertError);
      return NextResponse.json(
        {
          success: false,
          insertResult: null,
          selectResult: null,
          error: {
            message: insertError.message,
            code: insertError.code ?? null,
            details: insertError.details ?? null,
            hint: insertError.hint ?? null,
          },
          envPresence: getPotentialSponsorsTestEnvState().envPresence,
          clientCreated: true,
        },
        { status: 500 },
      );
    }

    const { data: selectResult, error: selectError } = await supabase
      .from("potential_sponsors")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    if (selectError) {
      logPotentialSponsorsTestError("Test potential sponsors select failed.", selectError);
      return NextResponse.json(
        {
          success: false,
          insertResult,
          selectResult: null,
          error: {
            message: selectError.message,
            code: selectError.code ?? null,
            details: selectError.details ?? null,
            hint: selectError.hint ?? null,
          },
          envPresence: getPotentialSponsorsTestEnvState().envPresence,
          clientCreated: true,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      insertResult,
      selectResult: selectResult ?? [],
      error: null,
      envPresence: getPotentialSponsorsTestEnvState().envPresence,
      clientCreated: true,
    });
  } catch (error) {
    logPotentialSponsorsTestError("Test potential sponsors route failed unexpectedly.", error);
    const typedError = error as {
      envPresence?: unknown;
    } | null;

    return NextResponse.json(
      {
        success: false,
        insertResult: null,
        selectResult: null,
        error: error instanceof Error ? error.message : "Failed to test potential sponsors access.",
        envPresence:
          typedError?.envPresence ?? getPotentialSponsorsTestEnvState().envPresence,
        clientCreated: false,
      },
      { status: 500 },
    );
  }
}

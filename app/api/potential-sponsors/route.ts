import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type PotentialSponsorPayload = {
  id?: unknown;
  business_name?: unknown;
  contact_name?: unknown;
  phone?: unknown;
  email?: unknown;
  notes?: unknown;
  status?: unknown;
};

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    const envPresence = {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(supabaseUrl),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      SUPABASE_SERVICE_ROLE: Boolean(process.env.SUPABASE_SERVICE_ROLE),
    };

    if (process.env.NODE_ENV !== "production") {
      console.error("Potential sponsors route missing Supabase env vars.", envPresence);
    }

    const error = new Error(
      "Missing server-side Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment.",
    ) as Error & {
      envPresence?: typeof envPresence;
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

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function logPotentialSponsorsRouteError(context: string, error: unknown) {
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
    envPresence: {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      SUPABASE_SERVICE_ROLE: Boolean(process.env.SUPABASE_SERVICE_ROLE),
    },
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
    const { data, error } = await supabase
      .from("potential_sponsors")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      logPotentialSponsorsRouteError("Potential sponsors GET route failed.", error);
      return NextResponse.json(
        { success: false, error: error.message, details: error },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    logPotentialSponsorsRouteError("Potential sponsors GET route failed unexpectedly.", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to load potential sponsors.",
        envPresence:
          error && typeof error === "object" && "envPresence" in error
            ? (error as { envPresence?: unknown }).envPresence
            : null,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PotentialSponsorPayload;
    const businessName =
      typeof body.business_name === "string" ? body.business_name.trim() : "";

    if (!businessName) {
      return NextResponse.json(
        { success: false, error: "business_name is required." },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("potential_sponsors")
      .insert({
        business_name: businessName,
        contact_name: normalizeOptionalString(body.contact_name),
        phone: normalizeOptionalString(body.phone),
        email: normalizeOptionalString(body.email),
        notes: normalizeOptionalString(body.notes),
        status:
          typeof body.status === "string" && body.status.trim()
            ? body.status.trim()
            : "Not Contacted",
      })
      .select("*")
      .single();

    if (error) {
      logPotentialSponsorsRouteError("Potential sponsors POST route failed.", error);
      return NextResponse.json(
        { success: false, error: error.message, details: error },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logPotentialSponsorsRouteError("Potential sponsors POST route failed unexpectedly.", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create potential sponsor.",
        envPresence:
          error && typeof error === "object" && "envPresence" in error
            ? (error as { envPresence?: unknown }).envPresence
            : null,
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as PotentialSponsorPayload;
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json(
        { success: false, error: "id is required." },
        { status: 400 },
      );
    }

    const updates: Record<string, string | null> = {};

    if (typeof body.business_name === "string") {
      const businessName = body.business_name.trim();

      if (!businessName) {
        return NextResponse.json(
          { success: false, error: "business_name cannot be empty." },
          { status: 400 },
        );
      }

      updates.business_name = businessName;
    }

    if ("contact_name" in body) {
      updates.contact_name = normalizeOptionalString(body.contact_name);
    }

    if ("phone" in body) {
      updates.phone = normalizeOptionalString(body.phone);
    }

    if ("email" in body) {
      updates.email = normalizeOptionalString(body.email);
    }

    if ("notes" in body) {
      updates.notes = normalizeOptionalString(body.notes);
    }

    if ("status" in body) {
      updates.status =
        typeof body.status === "string" && body.status.trim()
          ? body.status.trim()
          : "Not Contacted";
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("potential_sponsors")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      logPotentialSponsorsRouteError("Potential sponsors PATCH route failed.", error);
      return NextResponse.json(
        { success: false, error: error.message, details: error },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logPotentialSponsorsRouteError("Potential sponsors PATCH route failed unexpectedly.", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update potential sponsor.",
        envPresence:
          error && typeof error === "object" && "envPresence" in error
            ? (error as { envPresence?: unknown }).envPresence
            : null,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as PotentialSponsorPayload;
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json(
        { success: false, error: "id is required." },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("potential_sponsors")
      .delete()
      .eq("id", id)
      .select("*");

    if (error) {
      logPotentialSponsorsRouteError("Potential sponsors DELETE route failed.", error);
      return NextResponse.json(
        { success: false, error: error.message, details: error },
        { status: 500 },
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: "No potential sponsor was deleted." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logPotentialSponsorsRouteError("Potential sponsors DELETE route failed unexpectedly.", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete potential sponsor.",
        envPresence:
          error && typeof error === "object" && "envPresence" in error
            ? (error as { envPresence?: unknown }).envPresence
            : null,
      },
      { status: 500 },
    );
  }
}

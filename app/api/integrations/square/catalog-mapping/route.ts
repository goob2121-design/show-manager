import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createServiceRoleSupabaseClient,
  getSquareConfig,
  listSquareLocations,
  maskIdentifier,
  retrieveSquareCatalogObject,
} from "@/app/api/integrations/square/_lib";
import {
  buildShowMappingUpdate,
  mappingEnvironmentMatches,
  mappingReplacementRequiresConfirmation,
  validateSquareCatalogVariation,
} from "@/app/api/integrations/square/catalog-mapping";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";

export const runtime = "nodejs";

type MappingRequest = {
  action?: unknown;
  slug?: unknown;
  showId?: unknown;
  variationId?: unknown;
  environment?: unknown;
  replaceConfirmed?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MappingRequest;
    const action = textValue(body.action);
    const slug = textValue(body.slug);
    const showId = textValue(body.showId);
    const variationId = textValue(body.variationId);
    const submittedEnvironment = textValue(body.environment);

    if (!slug || !showId || !["connect", "disconnect"].includes(action)) {
      return NextResponse.json({ success: false, error: "A valid show and mapping action are required." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const hasAdminAccess = verifyAdminSessionCookieValue(
      slug,
      cookieStore.get(getAdminSessionCookieName(slug))?.value,
    );
    if (!hasAdminAccess) {
      return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    }

    const { config, missing, invalid } = getSquareConfig();
    if (!config) {
      return NextResponse.json({ success: false, error: "Square is not configured.", missing, invalid }, { status: 500 });
    }
    if (!mappingEnvironmentMatches(config.environment, submittedEnvironment)) {
      return NextResponse.json({ success: false, error: "Square environment changed. Refresh the page before mapping." }, { status: 409 });
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data: show, error: showError } = await supabase
      .from("shows")
      .select("id, slug, square_catalog_variation_id")
      .eq("id", showId)
      .eq("slug", slug)
      .maybeSingle();
    if (showError) throw showError;
    if (!show) return NextResponse.json({ success: false, error: "Show not found." }, { status: 404 });

    const previousVariationId = show.square_catalog_variation_id?.trim() || null;
    if (action === "disconnect") {
      const { error } = await supabase.from("shows").update(buildShowMappingUpdate(null)).eq("id", show.id).eq("slug", slug);
      if (error) throw error;
      console.info("Square catalog mapping changed.", {
        showId: show.id,
        environment: config.environment,
        previousVariationId: maskIdentifier(previousVariationId),
        newVariationId: null,
        changedAt: new Date().toISOString(),
        action: "disconnected",
      });
      return NextResponse.json({ success: true, message: "Square ticket disconnected successfully." });
    }

    if (!variationId) {
      return NextResponse.json({ success: false, error: "A Square Item Variation is required." }, { status: 400 });
    }
    if (mappingReplacementRequiresConfirmation(previousVariationId, variationId, body.replaceConfirmed === true)) {
      return NextResponse.json({ success: false, error: "Replacing the current Square mapping requires confirmation.", requiresConfirmation: true }, { status: 409 });
    }

    const [catalogObject, locations] = await Promise.all([
      retrieveSquareCatalogObject(config, variationId),
      listSquareLocations(config),
    ]);
    const validation = validateSquareCatalogVariation({
      requestedVariationId: variationId,
      object: catalogObject.object,
      relatedObjects: catalogObject.related_objects ?? [],
      locations,
    });
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("shows")
      .update(buildShowMappingUpdate(variationId))
      .eq("id", show.id)
      .eq("slug", slug);
    if (updateError) throw updateError;

    const mappingAction = previousVariationId && previousVariationId !== variationId ? "replaced" : "connected";
    console.info("Square catalog mapping changed.", {
      showId: show.id,
      environment: config.environment,
      previousVariationId: maskIdentifier(previousVariationId),
      newVariationId: maskIdentifier(variationId),
      changedAt: new Date().toISOString(),
      action: mappingAction,
    });
    return NextResponse.json({ success: true, message: "Square ticket connected successfully." });
  } catch (error) {
    console.error("Square catalog mapping failed.", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ success: false, error: "Unable to update the Square ticket mapping." }, { status: 500 });
  }
}

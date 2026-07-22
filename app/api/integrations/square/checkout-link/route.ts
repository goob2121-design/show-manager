import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import {
  createServiceRoleSupabaseClient,
  createSquareAdHocPaymentLink,
  createSquareCatalogPaymentLink,
  getSquareSandboxCatalogConfig,
  listSquareLocations,
  maskIdentifier,
  retrieveSquareCatalogObject,
  SquareApiError,
  type SanitizedSquareApiError,
  type SquareCatalogItem,
  type SquareCatalogMoney,
  type SquareCatalogVariation,
  type SquarePaymentLink,
} from "@/app/api/integrations/square/_lib";

export const runtime = "nodejs";

type CreateCheckoutLinkRequest = {
  slug?: unknown;
  quantity?: unknown;
};

type CheckoutDiagnostics = {
  sandboxBaseUrl: string;
  squareVersion: "2026-07-15";
  variationRetrievalSucceeded: boolean;
  variationType: string | null;
  variationId: string | null;
  parentItemId: string | null;
  parentItemName: string | null;
  variationName: string | null;
  variationIsDeleted: boolean | null;
  selectedLocationIdMasked: string | null;
  presentAtAllLocations: boolean | null;
  presentAtLocationIds: string[];
  absentAtLocationIds: string[];
  catalogBackedAttempted: boolean;
  adHocFallbackUsed: boolean;
  lineItem: { catalog_object_id?: string; quantity: "1" } | { name: string; quantity: "1"; base_price_money: SquareCatalogMoney } | null;
  squareError?: SanitizedSquareApiError;
};

function getQuantity(value: unknown) {
  const requestedQuantity = typeof value === "number" ? value : Number.parseInt(String(value ?? "1"), 10);
  return Number.isFinite(requestedQuantity) && requestedQuantity > 0 ? Math.floor(requestedQuantity) : 1;
}

function isCatalogVariation(value: SquareCatalogItem | SquareCatalogVariation | undefined): value is SquareCatalogVariation {
  return value?.type === "ITEM_VARIATION";
}

function isCatalogItem(value: SquareCatalogItem | SquareCatalogVariation | undefined): value is SquareCatalogItem {
  return value?.type === "ITEM";
}

function isPresentAtLocation(variation: SquareCatalogVariation, locationId: string) {
  if (variation.absent_at_location_ids?.includes(locationId)) return false;
  if (variation.present_at_all_locations) return true;
  return variation.present_at_location_ids?.includes(locationId) ?? false;
}

function chooseLocationForVariation(variation: SquareCatalogVariation, locationIds: string[]) {
  return locationIds.find((locationId) => isPresentAtLocation(variation, locationId)) ?? null;
}

function paymentLinkResponse(paymentLink: SquarePaymentLink, diagnostics: CheckoutDiagnostics) {
  return NextResponse.json({
    success: true,
    checkout: {
      id: paymentLink.id,
      url: paymentLink.url,
      longUrl: paymentLink.long_url ?? null,
      orderId: paymentLink.order_id ?? null,
      createdAt: paymentLink.created_at ?? new Date().toISOString(),
    },
    diagnostics,
  });
}

export async function POST(request: Request) {
  const { config, missing, invalid } = getSquareSandboxCatalogConfig();
  const diagnostics: CheckoutDiagnostics = {
    sandboxBaseUrl: config?.apiBaseUrl ?? "https://connect.squareupsandbox.com",
    squareVersion: "2026-07-15",
    variationRetrievalSucceeded: false,
    variationType: null,
    variationId: null,
    parentItemId: null,
    parentItemName: null,
    variationName: null,
    variationIsDeleted: null,
    selectedLocationIdMasked: null,
    presentAtAllLocations: null,
    presentAtLocationIds: [],
    absentAtLocationIds: [],
    catalogBackedAttempted: false,
    adHocFallbackUsed: false,
    lineItem: null,
  };

  try {
    const body = (await request.json()) as CreateCheckoutLinkRequest;
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const quantity = getQuantity(body.quantity);

    if (!slug) return NextResponse.json({ success: false, error: "Show slug is required.", diagnostics }, { status: 400 });

    const cookieStore = await cookies();
    const hasAdminAccess = verifyAdminSessionCookieValue(slug, cookieStore.get(getAdminSessionCookieName(slug))?.value);
    if (!hasAdminAccess) return NextResponse.json({ success: false, error: "Admin access is required.", diagnostics }, { status: 401 });

    if (!config) {
      return NextResponse.json({ success: false, error: "Square Sandbox checkout is not configured.", missing, invalid, diagnostics }, { status: 500 });
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data: show, error: showError } = await supabase
      .from("shows")
      .select("id, name, slug, square_catalog_variation_id")
      .eq("slug", slug)
      .maybeSingle();

    if (showError) throw showError;
    const typedShow = show as { id: string; name: string; slug: string; square_catalog_variation_id: string | null } | null;
    const catalogVariationId = typedShow?.square_catalog_variation_id?.trim() ?? "";
    diagnostics.variationId = catalogVariationId || null;

    if (!typedShow) return NextResponse.json({ success: false, error: "Show not found.", diagnostics }, { status: 404 });
    if (!catalogVariationId) return NextResponse.json({ success: false, error: "This show does not have a mapped Square catalog variation ID.", diagnostics }, { status: 400 });

    const catalogPayload = await retrieveSquareCatalogObject(config, catalogVariationId);
    diagnostics.variationRetrievalSucceeded = Boolean(catalogPayload.object);
    diagnostics.variationType = catalogPayload.object?.type ?? null;

    if (!isCatalogVariation(catalogPayload.object)) {
      return NextResponse.json({ success: false, error: "Mapped Square catalog object is not an ITEM_VARIATION.", diagnostics }, { status: 400 });
    }

    const variation = catalogPayload.object;
    const parentItem = catalogPayload.related_objects?.find((item) => isCatalogItem(item) && item.id === variation.item_variation_data?.item_id) as SquareCatalogItem | undefined;
    diagnostics.parentItemId = variation.item_variation_data?.item_id ?? null;
    diagnostics.parentItemName = parentItem?.item_data?.name ?? null;
    diagnostics.variationName = variation.item_variation_data?.name ?? null;
    diagnostics.variationIsDeleted = Boolean(variation.is_deleted);
    diagnostics.presentAtAllLocations = Boolean(variation.present_at_all_locations);
    diagnostics.presentAtLocationIds = variation.present_at_location_ids ?? [];
    diagnostics.absentAtLocationIds = variation.absent_at_location_ids ?? [];

    if (variation.is_deleted) {
      return NextResponse.json({ success: false, error: "Mapped Square catalog variation is archived/deleted.", diagnostics }, { status: 400 });
    }

    const locations = await listSquareLocations(config);
    const activeLocationIds = locations.filter((location) => location.id && location.status !== "INACTIVE").map((location) => location.id as string);
    const selectedLocationId = chooseLocationForVariation(variation, activeLocationIds);
    diagnostics.selectedLocationIdMasked = maskIdentifier(selectedLocationId);

    if (!selectedLocationId) {
      return NextResponse.json({ success: false, error: "No active Square Sandbox location has this variation present.", diagnostics }, { status: 400 });
    }

    diagnostics.catalogBackedAttempted = true;
    diagnostics.lineItem = { catalog_object_id: catalogVariationId, quantity: "1" };

    try {
      const paymentLink = await createSquareCatalogPaymentLink(config, {
        idempotencyKey: randomUUID(),
        locationId: selectedLocationId,
        catalogVariationId,
        quantity,
        description: `StageFlow Sandbox checkout for ${typedShow.name}`,
      });

      if (!paymentLink?.url || !paymentLink.id) return NextResponse.json({ success: false, error: "Square did not return a checkout link.", diagnostics }, { status: 502 });
      return paymentLinkResponse(paymentLink, diagnostics);
    } catch (error) {
      if (!(error instanceof SquareApiError)) throw error;
      diagnostics.squareError = error.toSanitizedResponse();
      console.error("Square catalog-backed checkout failed; trying Sandbox ad hoc fallback.", error.toServerLogObject());
    }

    const priceMoney = variation.item_variation_data?.price_money;
    if (!priceMoney?.currency || typeof priceMoney.amount !== "number") {
      return NextResponse.json({ success: false, error: "Catalog-backed checkout failed and variation has no fixed price for ad hoc fallback.", diagnostics }, { status: 502 });
    }

    diagnostics.adHocFallbackUsed = true;
    diagnostics.lineItem = {
      name: [parentItem?.item_data?.name, variation.item_variation_data?.name].filter(Boolean).join(" - ") || typedShow.name,
      quantity: "1",
      base_price_money: priceMoney,
    };

    const fallbackPaymentLink = await createSquareAdHocPaymentLink(config, {
      idempotencyKey: randomUUID(),
      locationId: selectedLocationId,
      name: diagnostics.lineItem.name,
      quantity,
      priceMoney,
      description: `StageFlow Sandbox ad hoc checkout fallback for ${typedShow.name}`,
    });

    if (!fallbackPaymentLink?.url || !fallbackPaymentLink.id) return NextResponse.json({ success: false, error: "Square did not return an ad hoc checkout link.", diagnostics }, { status: 502 });
    return paymentLinkResponse(fallbackPaymentLink, diagnostics);
  } catch (error) {
    if (error instanceof SquareApiError) {
      diagnostics.squareError = error.toSanitizedResponse();
      console.error("Square Sandbox checkout link creation failed with Square API error.", error.toServerLogObject());
      return NextResponse.json({ success: false, error: "Square API rejected the Sandbox checkout link request.", squareError: error.toSanitizedResponse(), diagnostics }, { status: 502 });
    }

    console.error("Square Sandbox checkout link creation failed.", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ success: false, error: "Unable to create Square Sandbox checkout link.", diagnostics }, { status: 500 });
  }
}
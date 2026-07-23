import type {
  SquareCatalogItem,
  SquareCatalogVariation,
  SquareLocation,
} from "@/app/api/integrations/square/_lib";

export type SquareCatalogMappingOption = {
  itemName: string;
  itemId: string;
  variationName: string;
  variationId: string;
  price: string;
  currency: string;
  status: "Active" | "Archived";
  locationAvailability: string;
};

function activeLocationIds(locations: SquareLocation[]) {
  return locations
    .filter((location) => location.id && location.status === "ACTIVE")
    .map((location) => location.id as string);
}

function isAvailableAtLocation(
  variation: SquareCatalogVariation,
  item: SquareCatalogItem,
  locationId: string,
) {
  if (variation.absent_at_location_ids?.includes(locationId) || item.absent_at_location_ids?.includes(locationId)) return false;
  if (variation.present_at_all_locations || item.present_at_all_locations) return true;
  return Boolean(
    variation.present_at_location_ids?.includes(locationId) ||
      item.present_at_location_ids?.includes(locationId),
  );
}

function formatMoney(amount: number | undefined, currency: string | undefined) {
  const resolvedCurrency = currency ?? "USD";
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return { price: "Variable", currency: resolvedCurrency };
  }
  return {
    price: new Intl.NumberFormat("en-US", { style: "currency", currency: resolvedCurrency }).format(amount / 100),
    currency: resolvedCurrency,
  };
}

export function validateSquareCatalogVariation(input: {
  requestedVariationId: string;
  object: SquareCatalogItem | SquareCatalogVariation | undefined;
  relatedObjects: Array<SquareCatalogItem | SquareCatalogVariation>;
  locations: SquareLocation[];
}) {
  const variationId = input.requestedVariationId.trim();
  if (!variationId) return { valid: false as const, error: "A Square Item Variation is required." };
  if (!input.object || input.object.type !== "ITEM_VARIATION" || input.object.id !== variationId) {
    return { valid: false as const, error: "The selected Square object is not an Item Variation." };
  }

  const variation = input.object;
  const parentItemId = variation.item_variation_data?.item_id?.trim() ?? "";
  const item = input.relatedObjects.find(
    (candidate): candidate is SquareCatalogItem => candidate.type === "ITEM" && candidate.id === parentItemId,
  );
  if (!item) return { valid: false as const, error: "The parent Square Catalog Item could not be verified." };
  if (item.is_deleted || variation.is_deleted) {
    return { valid: false as const, error: "Archived or deleted Square variations cannot be connected." };
  }

  const availableLocationIds = activeLocationIds(input.locations).filter((locationId) =>
    isAvailableAtLocation(variation, item, locationId),
  );
  if (availableLocationIds.length === 0) {
    return { valid: false as const, error: "The Square variation is not available at an active location." };
  }

  return { valid: true as const, item, variation, availableLocationIds };
}

export function buildSquareCatalogMappingOption(
  item: SquareCatalogItem,
  variation: SquareCatalogVariation,
  locations: SquareLocation[],
): SquareCatalogMappingOption | null {
  const validation = validateSquareCatalogVariation({
    requestedVariationId: variation.id ?? "",
    object: variation,
    relatedObjects: [item],
    locations,
  });
  if (!validation.valid) return null;
  return buildSquareCatalogDisplayOption(item, variation, locations);
}

export function buildSquareCatalogDisplayOption(
  item: SquareCatalogItem,
  variation: SquareCatalogVariation,
  locations: SquareLocation[],
): SquareCatalogMappingOption | null {
  if (!item.id || !variation.id) return null;
  const money = formatMoney(
    variation.item_variation_data?.price_money?.amount,
    variation.item_variation_data?.price_money?.currency,
  );
  const availableLocationCount = activeLocationIds(locations).filter((locationId) =>
    isAvailableAtLocation(variation, item, locationId),
  ).length;
  return {
    itemName: item.item_data?.name?.trim() || "Unnamed item",
    itemId: item.id,
    variationName: variation.item_variation_data?.name?.trim() || "Unnamed variation",
    variationId: variation.id,
    price: money.price,
    currency: money.currency,
    status: item.is_deleted || variation.is_deleted ? "Archived" : "Active",
    locationAvailability:
      availableLocationCount > 0
        ? `${availableLocationCount} active location${availableLocationCount === 1 ? "" : "s"}`
        : "Unavailable",
  };
}
export function buildShowMappingUpdate(variationId: string | null) {
  return { square_catalog_variation_id: variationId?.trim() || null };
}

export function mappingReplacementRequiresConfirmation(
  currentVariationId: string | null,
  newVariationId: string,
  replaceConfirmed: boolean,
) {
  return Boolean(currentVariationId && currentVariationId !== newVariationId && !replaceConfirmed);
}
export function mappingEnvironmentMatches(activeEnvironment: string, submittedEnvironment: string) {
  return activeEnvironment === submittedEnvironment;
}

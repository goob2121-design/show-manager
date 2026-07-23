import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShowMappingUpdate,
  mappingEnvironmentMatches,
  mappingReplacementRequiresConfirmation,
  validateSquareCatalogVariation,
} from "@/app/api/integrations/square/catalog-mapping";
import type {
  SquareCatalogItem,
  SquareCatalogVariation,
  SquareLocation,
} from "@/app/api/integrations/square/_lib";

const item: SquareCatalogItem = {
  type: "ITEM",
  id: "ITEM-1",
  present_at_all_locations: true,
  item_data: { name: "Show Ticket" },
};
const variation: SquareCatalogVariation = {
  type: "ITEM_VARIATION",
  id: "VARIATION-1",
  present_at_all_locations: true,
  item_variation_data: { item_id: "ITEM-1", name: "Regular" },
};
const locations: SquareLocation[] = [{ id: "LOCATION-1", status: "ACTIVE" }];

function validate(object: SquareCatalogItem | SquareCatalogVariation | undefined = variation) {
  return validateSquareCatalogVariation({
    requestedVariationId: "VARIATION-1",
    object,
    relatedObjects: [item],
    locations,
  });
}

test("accepts a valid Production variation", () => {
  assert.equal(mappingEnvironmentMatches("production", "production"), true);
  assert.equal(validate().valid, true);
});

test("accepts a valid Sandbox variation", () => {
  assert.equal(mappingEnvironmentMatches("sandbox", "sandbox"), true);
  assert.equal(validate().valid, true);
});

test("rejects a missing variation", () => {
  const result = validateSquareCatalogVariation({ requestedVariationId: "", object: undefined, relatedObjects: [], locations });
  assert.equal(result.valid, false);
});

test("rejects deleted variations", () => {
  assert.equal(validate({ ...variation, is_deleted: true }).valid, false);
});

test("rejects an Item ID when an Item Variation ID is required", () => {
  assert.equal(validate(item).valid, false);
});

test("requires confirmation before replacing an existing mapping", () => {
  assert.equal(mappingReplacementRequiresConfirmation("OLD", "NEW", false), true);
  assert.equal(mappingReplacementRequiresConfirmation("OLD", "NEW", true), false);
  assert.equal(mappingReplacementRequiresConfirmation("NEW", "NEW", false), false);
});

test("disconnecting updates only the show mapping field", () => {
  const update = buildShowMappingUpdate(null);
  assert.deepEqual(update, { square_catalog_variation_id: null });
  assert.deepEqual(Object.keys(update), ["square_catalog_variation_id"]);
});

test("mapping updates do not include ticket, seat-link, or assignment fields", () => {
  const update = buildShowMappingUpdate("VARIATION-1") as Record<string, unknown>;
  assert.equal("show_comp_tickets" in update, false);
  assert.equal("show_reserved_seating_links" in update, false);
  assert.equal("show_reserved_seat_assignments" in update, false);
});

test("rejects browser-submitted fake variation IDs", () => {
  assert.equal(validate(undefined).valid, false);
  assert.equal(validate({ ...variation, id: "DIFFERENT" }).valid, false);
});

test("rejects environment mismatches", () => {
  assert.equal(mappingEnvironmentMatches("production", "sandbox"), false);
  assert.equal(mappingEnvironmentMatches("sandbox", "production"), false);
});

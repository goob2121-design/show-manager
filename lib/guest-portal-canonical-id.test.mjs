import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const portalUrl = new URL("../app/guest/[slug]/page.tsx", import.meta.url);
const metadataUrl = new URL("./route-metadata.ts", import.meta.url);
const markOpenedUrl = new URL("../app/api/guest-profiles/mark-opened/route.ts", import.meta.url);
const showPageUrl = new URL("../app/components/show-page.tsx", import.meta.url);

test("Guest Portal and metadata use guest_profiles.id exclusively", async () => {
  const [portal, metadata] = await Promise.all([readFile(portalUrl, "utf8"), readFile(metadataUrl, "utf8")]);
  assert.ok(portal.includes('.eq("id", slug)'));
  assert.ok(metadata.includes('.eq("id", slug)'));
  assert.ok(!portal.includes("guest_token"));
  assert.ok(!metadata.includes("guest_token"));
});

test("mark-opened accepts and updates only guestProfileId", async () => {
  const route = await readFile(markOpenedUrl, "utf8");
  assert.ok(route.includes('typeof body.guestProfileId === "string"'));
  assert.ok(route.includes('.eq("id", guestProfileId)'));
  assert.ok(route.includes("portal_opened_at"));
  assert.ok(!route.includes("guestToken"));
  assert.ok(!route.includes("guest_token"));
});

test("admin guest links and profile updates retain the canonical profile ID", async () => {
  const source = await readFile(showPageUrl, "utf8");
  assert.ok(source.includes("const guestProfileId = profile.id"));
  assert.ok(source.includes("/guest/${guestProfileId}"));
  assert.ok(source.includes('.eq("id", existingProfile.id)'));
  assert.ok(!source.includes("guest_token"));
});
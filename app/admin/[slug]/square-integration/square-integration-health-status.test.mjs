import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const squarePageUrl = new URL("page.tsx", import.meta.url);
const showPageUrl = new URL("../../../components/show-page.tsx", import.meta.url);

test("Square Integration renders four responsive health indicators", async () => {
  const source = await readFile(squarePageUrl, "utf8");
  const healthStart = source.indexOf('aria-label="Square integration health"');
  const healthEnd = source.indexOf('{selectedEnvironment === "sandbox"', healthStart);
  const health = source.slice(healthStart, healthEnd);

  assert.ok(healthStart >= 0);
  assert.match(health, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.deepEqual(
    [...health.matchAll(/tracking-\[0\.12em\][^>]*>(Environment|Webhook|Ticket Mapping|Finance Sync)<\/p>/g)].map(
      (match) => match[1],
    ),
    ["Environment", "Webhook", "Ticket Mapping", "Finance Sync"],
  );
});

test("health values use the existing configuration and per-show settings", async () => {
  const source = await readFile(squarePageUrl, "utf8");

  assert.match(source, /const ticketMappingConnected = Boolean\(typedShow\?\.square_catalog_variation_id\?\.trim\(\)\);/);
  assert.match(source, /ticketMappingConnected \? "Connected" : "Not connected"/);
  assert.match(source, /const financeSyncEnabled = typedShow\?\.square_finance_sync_enabled === true;/);
  assert.match(source, /financeSyncEnabled \? "Enabled" : "Disabled"/);
  assert.match(source, /!missing\.some\([\s\S]*_SIGNATURE_KEY[\s\S]*_WEBHOOK_NOTIFICATION_URL/);
  assert.match(source, /webhookConfigured \? "Configured" : "Not configured"/);
  assert.doesNotMatch(source, /const webhookConfigured = true/);
});

test("Square Ticketing panel remains absent from Admin Overview", async () => {
  const source = await readFile(showPageUrl, "utf8");
  const overviewStart = source.indexOf('{isAdminView && activeAdminTab === "overview"');
  const overviewEnd = source.indexOf('{isAdminView && activeAdminTab === "mc-builder"', overviewStart);
  const overview = source.slice(overviewStart, overviewEnd);

  assert.doesNotMatch(overview, /Square Ticketing|Square Integration Status|Square Catalog/);
});

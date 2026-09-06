import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webhookUrl = new URL("../api/integrations/square/webhook/route.ts", import.meta.url);
const showPageUrl = new URL("show-page.tsx", import.meta.url);
const migrationUrl = new URL("../../supabase/migrations/20260816_add_square_finance_sync_phase1.sql", import.meta.url);

test("Square gross Finance sync runs after both pending-checkout and normal ticket ingestion", async () => {
  const source = await readFile(webhookUrl, "utf8");
  assert.equal((source.match(/maybeSyncImportedSquareFinance\(supabase, result/g) ?? []).length, 2);
  assert.match(source, /amountCents: typeof matchingLineItem\.total_money\?\.amount === "number"/);
  assert.match(source, /amountCents: typeof lineItem\.total_money\?\.amount === "number"/);
  assert.match(source, /\["imported", "incomplete_customer", "duplicate"\]/);
  assert.match(source, /processingStage = "sync_finance"/);
});

test("Phase 1 does not add refund, fee, payout, admission, or reserved-seat mutation logic", async () => {
  const source = await readFile(new URL("../../lib/square-finance-sync.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /refund|processing_fee|payout|chargeback|checked_in|seat_assignment|reserved_seating/i);
  assert.match(source, /category: "Presale Tickets"/);
  assert.match(source, /label: "Square Presale"/);
});

test("database migration defaults existing shows off and enforces gross-sale uniqueness", async () => {
  const source = await readFile(migrationUrl, "utf8");
  assert.match(source, /square_finance_sync_enabled boolean not null default false/);
  assert.match(source, /square_finance_sync_started_at timestamptz/);
  assert.match(source, /create unique index if not exists show_finance_items_square_gross_sale_unique/);
  for (const column of ["source", "source_kind", "show_id", "external_payment_id", "external_order_id", "external_line_item_uid"]) {
    assert.match(source, new RegExp(`\\b${column}\\b`));
  }
  assert.match(source, /System-managed Finance items are read-only/);
});

test("Finance UI identifies Square-managed rows and blocks system-managed edit/delete while manual forms remain", async () => {
  const source = await readFile(showPageUrl, "utf8");
  assert.match(source, /Square · Auto/);
  assert.match(source, /return item\.is_system_managed/);
  assert.match(source, /System-managed Finance items are read-only/);
  assert.match(source, /Add manual income items for this show/);
  assert.match(source, /Add manual expenses for this show/);
  assert.match(source, /\.from\("show_finance_items"\)[\s\S]*?\.insert\(\{/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/20260726_add_reserved_seating_link_owner_uniqueness.sql", import.meta.url);

test("reserved-link ownership migration stops before index creation when duplicates remain", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const guardIndex = sql.indexOf("having count(*) > 1");
  const exceptionIndex = sql.indexOf("raise exception");
  const createIndex = sql.indexOf("create unique index show_reserved_seating_links_show_id_source_ticket_id_unique");

  assert.ok(guardIndex >= 0);
  assert.ok(exceptionIndex > guardIndex);
  assert.ok(createIndex > exceptionIndex);
  assert.match(sql, /left\(show_id::text, 4\)[\s\S]*right\(show_id::text, 4\)/);
  assert.match(sql, /left\(source_ticket_id::text, 4\)[\s\S]*right\(source_ticket_id::text, 4\)/);
  assert.match(sql, /unique index show_reserved_seating_links_show_id_source_ticket_id_unique[\s\S]*\(show_id, source_ticket_id\)[\s\S]*where source_ticket_id is not null/i);
});

test("reserved-link ownership migration is additive and does not repair data silently", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.doesNotMatch(sql, /\b(delete|update|upsert|drop|alter table|create or replace)\b/i);
  assert.doesNotMatch(sql, /square_ticket_import_events|pending_square_checkouts|show_comp_tickets/);
});
test("ticket identity and canonical email lookup remain unchanged", async () => {
  const ingestionPath = new URL("./ticket-ingestion.ts", import.meta.url);
  const webhookPath = new URL("../app/api/integrations/square/webhook/route.ts", import.meta.url);
  const [ingestion, webhook] = await Promise.all([
    readFile(ingestionPath, "utf8"),
    readFile(webhookPath, "utf8"),
  ]);

  assert.match(ingestion, /\.eq\("external_source", input\.source\)[\s\S]*\.eq\("external_payment_id", input\.paymentId\)[\s\S]*\.eq\("external_order_id", input\.orderId\)[\s\S]*\.eq\("external_line_item_uid", input\.lineItemUid\)/);
  assert.equal((ingestion.match(/from\("show_comp_tickets"\)\.insert\(payload\)/g) ?? []).length, 1);
  assert.match(webhook, /\.eq\("source_ticket_id", result\.ticketId\)\.maybeSingle\(\)/);
  assert.match(webhook, /sendTrackedReservedSeatEmail\(supabase, link\.id\)/);
});

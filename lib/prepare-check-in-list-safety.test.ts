import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/20260725_add_admission_projection_sources.sql", import.meta.url);
const panelPath = new URL("../app/components/tickets/admissions-sync-preview-panel.tsx", import.meta.url);

test("migration enforces stable source uniqueness and per-show serialization", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /unique \(show_id, source_type, source_id\)/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /grant execute .* to service_role/i);
  assert.doesNotMatch(sql, /update\s+public\.show_reserved_seating_links/i);
  assert.doesNotMatch(sql, /update\s+public\.show_reserved_seat_assignments/i);
  assert.doesNotMatch(sql, /update\s+public\.show_comp_tickets/i);
  assert.doesNotMatch(sql, /delete\s+from/i);
});

test("migration inserts only minimal projection and ledger fields", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /insert into public\.show_comp_tickets/i);
  assert.match(sql, /insert into public\.show_admission_projection_sources/i);
  assert.doesNotMatch(sql, /external_(source|payment_id|order_id|line_item_uid)/i);
  assert.doesNotMatch(sql, /selection_token/i);
  assert.doesNotMatch(sql, /send_reserved|ticket-ingestion|integrations\/square/i);
});

test("confirmation UI is explicit and guards repeat submission", async () => {
  const panel = await readFile(panelPath, "utf8");
  assert.match(panel, /This will create missing check-in entries only\./);
  assert.match(panel, /if \(isPreparing\) return;/);
  assert.match(panel, /disabled=\{isPreparing\}/);
  assert.match(panel, /method: "POST"/);
  assert.match(panel, /await loadPreview\(\)/);
  assert.match(panel, /modify Square purchases/);
  assert.match(panel, /modify reserved-seat links/);
  assert.match(panel, /send emails/);
});

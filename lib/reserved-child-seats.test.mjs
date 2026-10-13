import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20261012_add_reserved_child_seats.sql", root), "utf8");
const securityMigration = await readFile(new URL("supabase/migrations/20261013_secure_reserved_seating_access.sql", root), "utf8");
const publicRoute = await readFile(new URL("app/api/reserved-seating/family-seats/route.ts", root), "utf8");
const selectionPage = await readFile(new URL("app/components/reserved-seat-selection-page.tsx", root), "utf8");
const doorRoute = await readFile(new URL("app/api/admin/shows/[showId]/reserved-family-check-in/route.ts", root), "utf8");
const doorPage = await readFile(new URL("app/components/door-mode-page.tsx", root), "utf8");
const adminRoute = await readFile(new URL("app/api/admin/shows/[showId]/reserved-seating/route.ts", root), "utf8");
const adminPanel = await readFile(new URL("app/components/reserved-seating-panel.tsx", root), "utf8");
const ticketIngestion = await readFile(new URL("lib/ticket-ingestion.ts", root), "utf8");

test("migration preserves existing admissions while adding separate child tracking", () => {
  assert.match(migration, /child_seat_limit integer not null default 0/);
  assert.match(migration, /child_checked_in_count integer not null default 0/);
  assert.match(migration, /occupant_type text not null default 'ticketed'/);
  assert.match(migration, /seat_category = 'paid_reserved'/);
  assert.doesNotMatch(migration, /update public\.show_comp_tickets\s+set\s+ticket_count/i);
  assert.doesNotMatch(migration, /square_(orders|payments)/i);
});

test("automatic allowances require a same-show paid-online admission", () => {
  assert.match(migration, /ticket\.show_id = link\.show_id/);
  assert.match(migration, /ticket\.ticket_type = 'paid_online'/);
  assert.match(migration, /link\.child_seat_limit < 3/);
  assert.doesNotMatch(migration, /where child_seat_limit = 0\s+and not coalesce\(is_complimentary/i);
});

test("Square reconciliation fills migration-gap allowances without lowering admin approvals", () => {
  assert.match(ticketIngestion, /\.rpc\("initialize_reserved_child_seat_allowance"/);
  assert.doesNotMatch(ticketIngestion, /updates\.child_seat_limit\s*=/);
  assert.doesNotMatch(ticketIngestion, /child_seat_limit:\s*Math\.min/);
});

test("reservation tables deny anonymous access and admin operations are server authorized", () => {
  assert.doesNotMatch(migration, /drop policy if exists "Allow public read reserved seating links"/);
  assert.doesNotMatch(migration, /revoke all on table public\.show_reserved_seating_links from anon, authenticated/);
  assert.match(securityMigration, /drop policy if exists "Allow public read reserved seating links"/);
  assert.match(securityMigration, /revoke all on table public\.show_reserved_seating_links from anon, authenticated/);
  assert.match(securityMigration, /revoke all on table public\.show_reserved_seat_assignments from anon, authenticated/);
  assert.match(adminRoute, /verifyAdminSessionCookieValue/);
  assert.match(adminRoute, /createServiceSupabaseClient/);
  assert.doesNotMatch(adminPanel, /from\("show_reserved_(seating_links|seat_assignments)"\)/);
  assert.doesNotMatch(adminPanel, /SUPABASE_SERVICE_ROLE/);
});

test("migration uses a transaction and table-specific constraint checks", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /conrelid = 'public\.show_reserved_seating_links'::regclass/);
  assert.match(migration, /conrelid = 'public\.show_reserved_seat_assignments'::regclass/);
  assert.match(migration, /commit;\s*$/);
});

test("family relocation is locked, count-preserving, conflict-safe, and barcode-preserving", () => {
  assert.match(migration, /where selection_token = btrim\(p_selection_token\)\s+for update/);
  assert.match(migration, /cardinality\(v_paid_ids\) <> v_existing_paid_count/);
  assert.match(migration, /PAID_SEAT_COUNT_CHANGED/);
  assert.match(migration, /assignment\.seating_link_id is distinct from v_link\.id/);
  assert.match(migration, /exception when unique_violation/);
  assert.match(migration, /return query select 'UPDATED'.*v_link\.scan_token/s);
  assert.doesNotMatch(migration, /set\s+scan_token\s*=/i);
  assert.doesNotMatch(migration, /set\s+selection_token\s*=/i);
});

test("database enforces child limits and blocks changes after check-in", () => {
  assert.match(migration, /cardinality\(v_child_ids\) > v_link\.child_seat_limit/);
  assert.match(migration, /CHILD_LIMIT_EXCEEDED/);
  assert.match(migration, /v_ticket\.checked_in_count, 0\) > 0 or v_link\.child_checked_in_count > 0/);
  assert.match(migration, /ALREADY_CHECKED_IN/);
  assert.match(migration, /v_ticket\.id is null or v_ticket\.ticket_type <> 'paid_online'/);
  assert.match(migration, /guard_reserved_child_assignment_mutations/);
  assert.match(migration, /stageflow\.child_mutation/);
});

test("child and adult check-in updates are atomic and bounded", () => {
  assert.match(migration, /create or replace function public\.adjust_reserved_family_check_in/);
  assert.match(migration, /v_next_adult < 0 or v_next_adult > v_ticket\.ticket_count/);
  assert.match(migration, /v_next_child < 0 or v_next_child > v_child_total/);
  assert.match(migration, /update public\.show_comp_tickets set/);
  assert.match(migration, /update public\.show_reserved_seating_links set child_checked_in_count/);
  assert.match(doorRoute, /adjust_reserved_family_check_in/);
  assert.match(doorPage, /Check In Complete Family/);
  assert.match(doorPage, /Free Children:/);
});

test("public customer controls are feature flagged and keep categories separate", () => {
  assert.match(publicRoute, /isReservedChildSeatsEnabled\(\)/);
  assert.match(publicRoute, /replace_reserved_family_seats/);
  assert.match(selectionPage, /childSeatsEnabled/);
  assert.match(selectionPage, /Paid Seats/);
  assert.match(selectionPage, /Free Children/);
  assert.match(selectionPage, /Total Occupied Seats/);
  assert.match(migration, /coalesce\(v_link\.is_complimentary, false\) or v_link\.seat_category <> 'paid_reserved'/);
});

test("concurrent and repeated submissions cannot duplicate seats", () => {
  assert.match(migration, /count\(distinct value\)/);
  assert.match(migration, /DUPLICATE_SEAT/);
  assert.match(migration, /SEAT_CONFLICT/);
  assert.match(migration, /delete from public\.show_reserved_seat_assignments where seating_link_id = v_link\.id/);
  assert.match(migration, /insert into public\.show_reserved_seat_assignments/);
});

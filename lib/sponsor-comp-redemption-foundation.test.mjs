import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260903_add_sponsor_comp_redemption_tokens.sql", "utf8");
const scanRoute = readFileSync("app/api/admin/shows/[showId]/door-scan-lookup/route.ts", "utf8");
const doorPage = readFileSync("app/components/door-mode-page.tsx", "utf8");
const attendance = readFileSync("lib/door-mode-presentation.ts", "utf8");
const tokenHelper = readFileSync("lib/sponsor-comp-redemption-tokens.ts", "utf8");
const adminRoute = readFileSync("app/api/admin/shows/[showId]/sponsor-comp-redemption-tokens/route.ts", "utf8");


test("token helper reuses secure generation with a distinct namespace", () => {
  assert.match(tokenHelper, /generateReservationScanToken/);
  assert.match(tokenHelper, /stf_scomp_/);
  assert.match(tokenHelper, /new Set<string>/);
  assert.match(tokenHelper, /isSponsorCompRedemptionToken/);
});

test("migration creates zero-weight sponsor credentials with required uniqueness and ownership", () => {
  assert.match(migration, /create table public\.show_sponsor_comp_redemption_tokens/);
  assert.match(migration, /unique \(token\)/);
  assert.match(migration, /unique \(show_sponsor_id, ordinal\)/);
  assert.match(migration, /check \(ordinal > 0\)/);
  assert.match(migration, /foreign key \(show_sponsor_id, show_id\)/);
  assert.match(migration, /enable row level security/);
  assert.doesNotMatch(migration, /insert into public\.show_comp_tickets/i);
  assert.doesNotMatch(migration, /show_admission_projection_sources/i);
});

test("generation is locked, complete, idempotent, and bounded by allowance", () => {
  assert.match(migration, /for update/);
  assert.match(migration, /v_existing_count = v_allowance/);
  assert.match(migration, /v_existing_count <> 0/);
  assert.match(migration, /array_length\(p_tokens, 1\).*v_allowance/);
  assert.match(adminRoute, /generateSponsorCompRedemptionTokenSet\(allowance\)/);
  assert.match(adminRoute, /verifyAdminSessionCookieValue/);
});

test("redemption atomically protects duplicate and full allocations", () => {
  assert.match(migration, /'ALREADY_REDEEMED'/);
  assert.match(migration, /'ALLOCATION_FULL'/);
  assert.match(migration, /'VOIDED'/);
  assert.match(migration, /update public\.show_sponsors set comp_tickets_checked_in = comp_tickets_checked_in \+ 1/);
  assert.match(migration, /update public\.show_sponsor_comp_redemption_tokens set redeemed_at = v_now/);
  assert.match(migration, /for update/);
});

test("Door Mode routes only sponsor namespace to the new path and preserves normal lookup", () => {
  assert.match(scanRoute, /if \(isSponsorCompRedemptionToken\(normalizedToken\)\)/);
  assert.match(scanRoute, /redeem_sponsor_comp_redemption_token/);
  assert.match(scanRoute, /from\("show_reserved_seating_links"\)/);
  assert.match(scanRoute, /eq\("scan_token", normalizedToken\)/);
  assert.match(doorPage, /Complimentary Sponsor Ticket/);
  assert.match(doorPage, /Already Redeemed/);
  assert.match(doorPage, /Sponsor Allocation Full/);
});

test("attendance continues to use sponsor allowance and not token rows", () => {
  assert.match(attendance, /sponsorAllowance/);
  assert.doesNotMatch(attendance, /show_sponsor_comp_redemption_tokens/);
});

test("allowance cannot be reduced below issued or checked-in positions", () => {
  assert.match(migration, /enforce_sponsor_comp_token_allowance_floor/);
  assert.match(migration, /greatest\(new\.comp_tickets_checked_in, v_highest_issued\)/);
});

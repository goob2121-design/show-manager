import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260910_add_sponsor_comp_redemption_token_undo.sql",
  "utf8",
).replace(/\r\n/g, "\n");
const route = readFileSync(
  "app/api/admin/shows/[showId]/sponsor-comp-redemption-token-undo/route.ts",
  "utf8",
).replace(/\r\n/g, "\n");
const doorPage = readFileSync("app/components/door-mode-page.tsx", "utf8").replace(/\r\n/g, "\n");
const scanRoute = readFileSync(
  "app/api/admin/shows/[showId]/door-scan-lookup/route.ts",
  "utf8",
).replace(/\r\n/g, "\n");

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("dedicated undo is service-role-only and Door Mode authenticated", () => {
  assert.match(migration, /revoke all on function public\.undo_sponsor_comp_redemption_token[^;]+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.undo_sponsor_comp_redemption_token[^;]+to service_role/);
  assert.match(route, /export async function POST/);
  assert.match(route, /resolveDoorAccess/);
  assert.match(route, /getAdminSessionCookieName/);
  assert.match(route, /getDoorStaffSessionCookieName/);
  assert.match(route, /undo_sponsor_comp_redemption_token/);
});

test("undo locks sponsor then exact token and validates ownership", () => {
  const sponsorLock = migration.indexOf("from public.show_sponsors sponsor");
  const tokenLock = migration.indexOf("and token_row.show_sponsor_id = v_sponsor.id\n  for update", sponsorLock);
  assert.ok(sponsorLock >= 0 && tokenLock > sponsorLock);
  assert.match(migration, /where token_row\.id = p_token_id/);
  assert.match(migration, /v_token\.show_id <> p_show_id/);
  assert.match(migration, /sponsor\.id = v_token\.show_sponsor_id/);
  assert.match(migration, /sponsor\.show_id = p_show_id/);
});

test("successful undo atomically decrements once and clears only the exact token", () => {
  assert.match(migration, /set comp_tickets_checked_in = comp_tickets_checked_in - 1/);
  assert.match(migration, /set redeemed_at = null,\n      redeemed_by = null/);
  assert.match(migration, /where id = v_token\.id\n    and show_id = p_show_id\n    and show_sponsor_id = v_sponsor\.id/);
  assert.match(migration, /return query select 'UNDONE'/);
  assert.doesNotMatch(migration, /order by redeemed_at|order by ordinal|limit 1/i);
});

test("unredeemed, duplicate undo, voided, zero-count, and wrong-show requests are safe", () => {
  const firstUpdate = migration.indexOf("update public.show_sponsors");
  for (const status of ["WRONG_SHOW", "VOIDED", "NOT_REDEEMED", "COUNT_ZERO"]) {
    const statusIndex = migration.indexOf(`'${status}'`);
    assert.ok(statusIndex >= 0 && statusIndex < firstUpdate, `${status} must return before updates`);
  }
  assert.match(migration, /if v_token\.redeemed_at is null then/);
  assert.match(migration, /if v_sponsor\.comp_tickets_checked_in <= 0 then/);
});

test("scan and undo responses carry authoritative sponsor and exact-token identity", () => {
  assert.match(scanRoute, /tokenId: row\.token_id/);
  assert.match(scanRoute, /showSponsorId: row\.show_sponsor_id/);
  assert.match(scanRoute, /ordinal: row\.ordinal/);
  assert.match(route, /tokenId: row\.token_id/);
  assert.match(route, /showSponsorId: row\.show_sponsor_id/);
  assert.match(route, /allowance: row\.allowance/);
  assert.match(route, /checkedIn: row\.checked_in/);
  assert.match(route, /remaining: row\.remaining/);
});

test("successful barcode scans create one exact-token activity with dedicated undo", () => {
  assert.match(doorPage, /redemption\.resultStatus === "REDEEMED"/);
  assert.match(doorPage, /sponsor-comp-token-\$\{redemption\.tokenId\}/);
  assert.match(doorPage, /Ticket \$\{redemption\.ordinal\} of \$\{redemption\.allowance\} — Checked In/);
  assert.match(doorPage, /tokenId: redemption\.tokenId/);
  assert.match(doorPage, /undo: \(\) => undoSponsorCompRedemption\(redemption\)/);
  assert.match(doorPage, /Check-In Undone/);
  assert.match(doorPage, /undo: null/);
});

test("dedicated undo refreshes attendance source from authoritative checked-in total", () => {
  assert.match(doorPage, /applySponsorCompUndoTotals\(payload\.result\)/);
  assert.match(doorPage, /comp_tickets_checked_in: result\.checkedIn/);
  assert.match(doorPage, /payload\.result\.resultStatus !== "UNDONE"/);
});

test("generic manual Sponsor Comp undo remains count-only and never reactivates a token", () => {
  const genericAdjustment = sourceBetween(
    doorPage,
    "  async function handleAdjustSponsorCompCheckIn(",
    "  async function handleCheckInCustomSponsorCompAmount(",
  );
  assert.match(genericAdjustment, /from\("show_sponsors"\)/);
  assert.match(genericAdjustment, /comp_tickets_checked_in: previousCheckedInCount/);
  assert.doesNotMatch(genericAdjustment, /show_sponsor_comp_redemption_tokens/);
  assert.doesNotMatch(genericAdjustment, /undo_sponsor_comp_redemption_token/);
  assert.match(doorPage, /handleAdjustSponsorCompCheckIn\(sponsor, -1\)/);
});

test("normal admission scan and unrelated Door Mode integrations remain on existing paths", () => {
  assert.match(scanRoute, /from\("show_reserved_seating_links"\)/);
  assert.match(doorPage, /openCashDrawerAfterPaidSale/);
  assert.match(doorPage, /eligibleDoorModeKeypadQuantity/);
  assert.doesNotMatch(migration, /show_comp_tickets|cash|square|print_studio/i);
});

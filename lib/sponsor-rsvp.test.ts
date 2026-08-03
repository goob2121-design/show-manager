import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const sponsorRsvpModulePromise = import(new URL("./sponsor-rsvp.ts", import.meta.url).href);

const migrationPath = new URL("../supabase/migrations/20260802_add_sponsor_rsvp_phase1.sql", import.meta.url);
const publicRoutePath = new URL("../app/api/sponsor-rsvp/route.ts", import.meta.url);
const publicPagePath = new URL("../app/components/sponsor-rsvp-page.tsx", import.meta.url);
const qrRoutePath = new URL("../app/api/sponsor-rsvp/qr/route.ts", import.meta.url);
const adminRoutePath = new URL("../app/api/admin/shows/[showId]/sponsor-rsvps/route.ts", import.meta.url);
const packetPath = new URL("../app/components/sponsor-packet-builder.tsx", import.meta.url);

test("Sponsor IDs are uppercase, unambiguous, and exactly two letters plus two digits", async () => {
  const { generateSponsorCode, isValidSponsorCode, normalizeSponsorCode } = await sponsorRsvpModulePromise;
  const code = generateSponsorCode(() => 0.01);
  assert.match(code, /^[A-HJ-NP-Z]{2}\d{2}$/);
  assert.equal(isValidSponsorCode(code.toLowerCase()), true);
  assert.equal(normalizeSponsorCode(` ${code.toLowerCase()} `), code);
});

test("collision-safe generator retries duplicate candidates", async () => {
  const { generateUniqueSponsorCode } = await sponsorRsvpModulePromise;
  const values = [0, 0, 0.01, 0.2, 0.2, 0.44]; let index = 0;
  const code = await generateUniqueSponsorCode(async (candidate: string) => candidate === "AA01", () => values[index++] ?? 0.5);
  assert.notEqual(code, "AA01"); assert.match(code, /^[A-HJ-NP-Z]{2}\d{2}$/);
});

test("migration backfills permanent codes and enforces one RSVP per sponsor and show", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /where sponsor_code is null/);
  assert.match(sql, /alter column sponsor_code set not null/);
  assert.match(sql, /unique \(sponsor_id, show_id\)/);
  assert.match(sql, /status in \('pending', 'attending', 'not_attending'\)/);
  assert.match(sql, /guest_count > 0/);
  assert.match(sql, /revoke all on public\.sponsor_show_rsvps from anon/);
});

test("public lookup is neutral, narrow, show-specific, and requires identity confirmation", async () => {
  const route = await readFile(publicRoutePath, "utf8"); const page = await readFile(publicPagePath, "utf8");
  assert.match(route, /We couldn't find that Sponsor ID/);
  assert.match(route, /select\("id,name,recognition_name,sponsor_code"\)/);
  assert.doesNotMatch(route, /email|phone|address_line|payment|ticket|seat_assignment/);
  assert.match(route, /eq\("sponsor_id", sponsor\.id\)[\s\S]*?eq\("show_id", show\.id\)/);
  assert.match(page, /Is this your organization\?/);
  assert.match(page, /Yes, Continue/);
  assert.match(page, /useSearchParams/);
});

test("valid Sponsor ID lookup uses sponsor_code without the unavailable archive column", async () => {
  const route = await readFile(publicRoutePath, "utf8");
  assert.match(route, /\.eq\("sponsor_code", code\)[\s\S]*?\.maybeSingle\(\)/);
  assert.doesNotMatch(route, /\.eq\("is_archived"/);
  assert.doesNotMatch(route, /sponsor_library\.is_archived/);
  assert.match(route, /Sponsor lookup completed/);
  assert.match(route, /sponsor: \{ publicName: found\.sponsor\.recognition_name\?\.trim\(\) \|\| found\.sponsor\.name \}/);
});

test("Supabase failures retain safe server-side error diagnostics", async () => {
  const route = await readFile(publicRoutePath, "utf8");
  assert.match(route, /code: error\.code \?\? null/);
  assert.match(route, /message: error\.message \?\? null/);
  assert.match(route, /details: error\.details \?\? null/);
  assert.match(route, /hint: error\.hint \?\? null/);
  assert.match(route, /logSupabaseError\("Sponsor lookup", error\)/);
  assert.doesNotMatch(route, /SERVICE_ROLE.*console|console.*SERVICE_ROLE/);
});
test("public page uses CMMS branding, exact entry guidance, and mobile-first controls", async () => {
  const page = await readFile(publicPagePath, "utf8");
  assert.match(page, /Cumberland Mountain Music Show/);
  assert.match(page, /Big-Time Show[\s\S]*Small-Town Hospitality/);
  assert.match(page, /Your Sponsor ID is printed in your Sponsor Appreciation Packet\./);
  assert.match(page, /min-h-dvh overflow-x-hidden bg-\[#050c1d\]/);
  assert.match(page, /max-w-2xl/);
  assert.match(page, /min-h-16/);
  assert.match(page, /min-h-12/);
  assert.match(page, /How many guests will attend\?/);
  assert.match(page, /Thank you! We’re looking forward to seeing you\./);
  assert.match(page, /Thank you for letting us know\./);
});
test("RSVP submission upserts without ticket or seat mutations", async () => {
  const route = await readFile(publicRoutePath, "utf8");
  assert.match(route, /from\("sponsor_show_rsvps"\)\.upsert/);
  assert.match(route, /onConflict: "sponsor_id,show_id"/);
  assert.doesNotMatch(route, /show_reserved|show_comp_tickets|scan_token|ticket_count/);
});

test("admin summary counts statuses and guests", async () => {
  const { summarizeSponsorRsvps } = await sponsorRsvpModulePromise;
  assert.deepEqual(summarizeSponsorRsvps([{ status: "attending", guest_count: 3 }, { status: "not_attending", guest_count: null }, { status: "pending", guest_count: null }]), { attending: 1, totalGuests: 3, notAttending: 1, pending: 1 });
});

test("admin route is authenticated and packet includes personalized one-page RSVP instructions", async () => {
  const admin = await readFile(adminRoutePath, "utf8"); const packet = await readFile(packetPath, "utf8"); const qrRoute = await readFile(qrRoutePath, "utf8");
  assert.match(admin, /verifyAdminSessionCookieValue/);
  assert.match(packet, /packet-page packet-rsvp-page/);
  assert.match(qrRoute, /https:\/\/stageflow\.cumberlandmountainmusic\.com\/sponsor-rsvp\?code=/);
  assert.match(packet, /Your Sponsor ID/);
  assert.match(packet, /pageNumberFor\("rsvp"\)/);
  assert.match(packet, /min-h-\[11in\]/);
  assert.match(qrRoute, /QRCode\.toBuffer\(target/);
  assert.match(qrRoute, /sponsor-rsvp\?code=/);
});

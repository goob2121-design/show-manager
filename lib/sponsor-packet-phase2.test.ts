import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packetModulePromise = import(new URL("./sponsor-packet.ts", import.meta.url).href);
const componentPath = new URL("../app/components/sponsor-packet-builder.tsx", import.meta.url);
const routePath = new URL("../app/api/admin/shows/[showId]/sponsor-packet/route.ts", import.meta.url);
const migrationPath = new URL("../supabase/migrations/20260728_add_sponsor_packet_drafts_and_band_profiles.sql", import.meta.url);

const profile = {
  id: "profile-1",
  profileKey: "cmms_house_band",
  displayName: "The Cumberland Mountain Music Show Band",
  description: "Regional musicians.",
  members: [
    { sourceId: "member-1", name: "Bryan Turner", role: "Bass and Vocals", included: true },
    { sourceId: "member-2", name: "Stuart Wyrick", role: "Banjo and Vocals", included: true },
  ],
};

async function baseDraft(showId = "show-1", sponsorId = "sponsor-a") {
  const { buildSponsorPacketDraft } = await packetModulePromise;
  return buildSponsorPacketDraft({
    sponsor: { id: sponsorId, name: sponsorId, recognition_notes: null },
    show: { id: showId, slug: showId, name: showId, show_date: "2026-08-15", venue: null, venue_address: null, show_start_time: null },
    bandProfile: profile,
    today: "2026-07-28",
  });
}

function savedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft-1", show_id: "show-1", sponsor_library_id: "sponsor-a", packet_date: "2026-07-28", sponsor_name_override: "Sponsor A packet", contact_person: null, greeting_name: null, mailing_address_line_1: null, mailing_address_line_2: null, mailing_city: null, mailing_state: null, mailing_zip: null, letter_heading: null, personal_message: "Saved message", additional_note: null, closing_name: null, closing_title: null, contact_email: null, contact_phone: null, show_date_override: null, doors_time_override: null, show_time_override: null, include_tickets: false, ticket_quantity: 0, admission_type: "general", assigned_seat_labels: [], seat_instructions: null, ticket_enclosure_note: null, enabled_sections: {}, guest_name_override: null, guest_bio_override: null, guest_photo_url_override: null, band_heading_override: null, band_description_override: null, band_members_override: null, sponsor_recognition_override: null, venue_name_override: null, venue_address_override: null, created_at: "2026-07-28T12:00:00Z", updated_at: "2026-07-28T13:00:00Z", ...overrides,
  };
}

test("saved draft application remains isolated to its explicit sponsor/show base", async () => {
  const { applySavedSponsorPacketDraft } = await packetModulePromise;
  const sponsorA = applySavedSponsorPacketDraft(await baseDraft("show-1", "sponsor-a"), savedRow());
  const sponsorB = await baseDraft("show-1", "sponsor-b");
  const anotherShow = await baseDraft("show-2", "sponsor-a");
  assert.equal(sponsorA.thankYouMessage, "Saved message");
  assert.notEqual(sponsorB.thankYouMessage, "Saved message");
  assert.notEqual(anotherShow.thankYouMessage, "Saved message");
});

test("serialization contains packet overrides but no sponsor/show/source record mutation payload", async () => {
  const { serializeSponsorPacketDraft } = await packetModulePromise;
  const draft = await baseDraft();
  const payload = serializeSponsorPacketDraft(draft);
  assert.equal(payload.band_members_override[0]?.name, "Bryan Turner");
  assert.equal("show_id" in payload, false);
  assert.equal("sponsor_library_id" in payload, false);
  assert.equal("selection_token" in payload, false);
  assert.equal("square_order_id" in payload, false);
});

test("canonical band order is cloned and packet-only hiding does not mutate the profile", async () => {
  const draft = await baseDraft();
  assert.deepEqual(draft.bandMembers.map((member: { name: string }) => member.name), ["Bryan Turner", "Stuart Wyrick"]);
  draft.bandMembers[0].included = false;
  draft.bandMembers[1].role = "Packet override";
  assert.equal(profile.members[0].included, true);
  assert.equal(profile.members[1].role, "Banjo and Vocals");
});

test("missing optional band description still produces an ordered usable draft", async () => {
  const draft = await baseDraft();
  const noDescriptionProfile = { ...profile, description: "", members: profile.members };
  const { buildSponsorPacketDraft } = await packetModulePromise;
  const next = buildSponsorPacketDraft({ sponsor: { id: "s", name: "S" }, show: { id: "x", slug: "x", name: "X", show_date: null, venue: null, venue_address: null, show_start_time: null }, bandProfile: noDescriptionProfile });
  assert.equal(next.bandDescription, "");
  assert.equal(next.bandMembers.length, 2);
  assert.equal(draft.bandMembers.length, 2);
});

test("UI protects unsaved changes, resets from canonical profile, and omits hidden members from print", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /window\.confirm\("You have unsaved sponsor packet changes/);
  assert.match(source, /beforeunload/);
  assert.match(source, /Reset Band Section to Defaults/);
  assert.match(source, /cloneBandMembers\(bandProfile\?\.members/);
  assert.match(source, /bandMembers\.filter\(\(member\) => member\.included\)\.map/);
  assert.match(source, /Save Draft/);
  assert.match(source, /Save Changes/);
  assert.match(source, /Saved draft loaded/);
  assert.match(source, /Last saved/);
});

test("API scopes load/upsert/delete to the exact show and sponsor pair", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /verifyAdminSessionCookieValue/);
  assert.match(source, /show\.slug !== slug/);
  assert.match(source, /status: 401/);
  assert.match(source, /\.eq\("show_id", showId\)\.eq\("sponsor_library_id", sponsorId\)/);
  assert.match(source, /onConflict: "show_id,sponsor_library_id"/);
  assert.equal((source.match(/\.from\("sponsor_packet_drafts"\)/g) ?? []).length, 3);
  assert.doesNotMatch(source, /\.from\("(shows|sponsor_library|show_sponsors|guest_profiles|show_reserved_seating_links|show_reserved_seat_assignments)"\)\.(insert|update|upsert|delete)/);
});

test("migration is additive, seeds the trusted band order, and denies public draft access", async () => {
  const source = await readFile(migrationPath, "utf8");
  assert.match(source, /create table if not exists public\.sponsor_packet_drafts/);
  assert.match(source, /unique \(show_id, sponsor_library_id\)/);
  assert.match(source, /create table if not exists public\.show_band_profiles/);
  assert.match(source, /create table if not exists public\.show_band_profile_members/);
  assert.match(source, /enable row level security/);
  assert.match(source, /revoke all on table public\.sponsor_packet_drafts from public, anon, authenticated/);
  assert.match(source, /grant select, insert, update, delete on table public\.sponsor_packet_drafts to service_role/);
  assert.doesNotMatch(source, /drop table|drop column|alter column|create or replace/i);
  const names = ["Bryan Turner", "Stuart Wyrick", "Justin Salyer", "Sawyer Blankenship", "Clint Hurd"];
  for (let index = 1; index < names.length; index += 1) assert.ok(source.indexOf(names[index - 1]) < source.indexOf(names[index]));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/20260802_expand_sponsor_library_contact_fields.sql", import.meta.url);
const showPagePath = new URL("../app/components/show-page.tsx", import.meta.url);
const fieldsPath = new URL("../app/components/sponsor-library-profile-fields.tsx", import.meta.url);
const welcomePath = new URL("../app/components/door-welcome-display.tsx", import.meta.url);

test("migration is additive, nullable, and constrains preferred contact safely", async () => {
  const source = await readFile(migrationPath, "utf8");
  for (const column of [
    "contact_person", "contact_title", "email", "phone", "mobile_phone",
    "address_line_1", "address_line_2", "city", "state", "postal_code",
    "legal_name", "recognition_name", "facebook_url", "instagram_url",
    "standard_sponsorship_amount", "is_in_kind", "in_kind_description",
    "sponsor_since_year", "renewal_date", "notes", "last_contacted_at",
    "preferred_contact_notes",
  ]) assert.match(source, new RegExp(`add column if not exists ${column}`));
  assert.match(source, /preferred_contact_method text not null default 'none'/);
  assert.match(source, /preferred_contact_method in \('email', 'phone', 'text', 'none'\)/);
  assert.match(source, /last_contacted_at timestamptz/);
  assert.match(source, /renewal_date date/);
  assert.match(source, /sponsor_since_year integer/);
  assert.match(source, /standard_sponsorship_amount numeric/);
  assert.doesNotMatch(source, /website_url/);
  assert.doesNotMatch(source, /add column if not exists sponsorship_level/);
});

test("shared Add/Edit profile sections persist the expanded admin fields", async () => {
  const [showSource, fieldsSource] = await Promise.all([
    readFile(showPagePath, "utf8"),
    readFile(fieldsPath, "utf8"),
  ]);
  for (const heading of ["Sponsor Identity", "Primary Contact", "Address", "Online Presence", "Sponsorship Details", "Notes"]) {
    assert.match(fieldsSource, new RegExp(`title="${heading}"`));
  }
  assert.equal((showSource.match(/<SponsorLibraryProfileFields/g) ?? []).length, 2);
  assert.match(showSource, /contact_person: normalizeOptionalField\(newSponsorLibraryFormState\.contactPerson\)/);
  assert.match(showSource, /contact_person: normalizeOptionalField\(sponsorLibraryFormState\.contactPerson\)/);
  assert.match(showSource, /is_in_kind: .*\.isInKind/);
  assert.match(fieldsSource, /value\.isInKind \? <label/);
});

test("Sponsor Library profile form uses accessible dark panels and responsive fields", async () => {
  const source = await readFile(fieldsPath, "utf8");
  assert.doesNotMatch(source, /bg-stone-50|bg-white|border-stone-200|border-stone-300/);
  assert.match(source, /bg-slate-900\/80/);
  assert.match(source, /bg-slate-950\/70/);
  assert.match(source, /aria-labelledby=\{headingId\}/);
  assert.match(source, /<h3 id=\{headingId\}/);
  assert.equal((source.match(/title="(?:Sponsor Identity|Primary Contact|Address|Online Presence|Sponsorship Details|Notes)"/g) ?? []).length, 6);
  assert.match(source, /grid gap-4 sm:grid-cols-2/);
  assert.match(source, /name="name" value=\{value\.name\} onChange=\{onChange\}/);
  assert.match(source, /name="preferredContactMethod" value=\{value\.preferredContactMethod\} onChange=\{onChange\}/);
  assert.match(source, /name="lastContactedAt" value=\{value\.lastContactedAt\} onChange=\{onChange\}/);
});
test("summary details stay admin-only and Welcome Display sponsor behavior is untouched", async () => {
  const [showSource, welcomeSource] = await Promise.all([
    readFile(showPagePath, "utf8"),
    readFile(welcomePath, "utf8"),
  ]);
  assert.match(showSource, /sponsorRecognitionName\(sponsor\)/);
  assert.match(showSource, /href={`mailto:\$\{sponsor\.email\}`}/);
  assert.match(showSource, /href={`tel:\$\{primaryPhone\}`}/);
  assert.match(showSource, /sponsor\.contact_person \? <span/);
  assert.match(welcomeSource, /sponsor:sponsor_library\(name, logo_url\)/);
  assert.doesNotMatch(welcomeSource, /contact_person|email|phone|notes|recognition_name/);
});

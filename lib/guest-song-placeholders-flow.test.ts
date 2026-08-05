import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const showPageSource = readFileSync("app/components/show-page.tsx", "utf8");
const schemaSource = readFileSync("supabase/schema.sql", "utf8");
const migrationSource = readFileSync("supabase/migrations/20260805_add_guest_song_placeholders.sql", "utf8");
const liveSource = readFileSync("app/components/band-live-page.tsx", "utf8");
const mcSource = readFileSync("app/mc/[slug]/page.tsx", "utf8");
const printSource = readFileSync("app/admin/[slug]/print/[kind]/page.tsx", "utf8");
const reminderSource = readFileSync("app/api/admin/shows/[showId]/guest-reminder/route.ts", "utf8");

test("placeholder schema is additive and keeps normal guest songs unchanged", () => {
  for (const source of [schemaSource, migrationSource]) {
    assert.match(source, /is_placeholder boolean not null default false/);
    assert.match(source, /placeholder_number integer/);
    assert.match(source, /guest_profile_id uuid references public\.guest_profiles/);
    assert.match(source, /show_guest_songs_placeholder_number_idx/);
  }
  assert.doesNotMatch(migrationSource, /insert into public\.songs|update public\.show_guest_songs/);
});

test("admin creates placeholders in the existing guest-song pool and labels them", () => {
  assert.match(showPageSource, /\+ Add Guest Song Placeholders/);
  assert.match(showPageSource, /How many guest-song placeholders\?/);
  assert.match(showPageSource, /Create Placeholders/);
  assert.match(showPageSource, /\.from\("show_guest_songs"\)[\s\S]*\.insert\(placeholderRows\)/);
  assert.match(showPageSource, />\s*Placeholder\s*<\/span>/);
  assert.match(showPageSource, /song\.is_placeholder \? " \(Placeholder\)" : ""/);
});

test("placeholders reuse existing setlist and rehearsal insertion without metadata or library writes", () => {
  assert.match(showPageSource, /source_type: "guest",\s*guest_song_id: songToPlace\.id/);
  assert.match(showPageSource, /const matchedLibrarySong = selectedGuestSong\.is_placeholder\s*\? null/);
  assert.match(showPageSource, /selectedGuestSong\.is_placeholder\s*\? null\s*: selectedGuestSong\.sung_by/);
  assert.match(showPageSource, /const normalizedNotes = selectedGuestSong\.is_placeholder\s*\? ""/);
  assert.match(showPageSource, /setRehearsalEntries\(\(currentEntries\) =>/);
});

test("active setlist placeholders cannot be silently deleted and guest submissions stay unchanged", () => {
  assert.match(showPageSource, /songToDelete\.is_placeholder && setlistUsageCount > 0/);
  assert.match(showPageSource, /Remove this placeholder from the setlist before deleting it\./);
  assert.match(showPageSource, /if \(song\.is_placeholder\) return false/);
  assert.match(showPageSource, /!song\.is_placeholder && isGuestSongForProfile/);
  assert.match(reminderSource, /\.eq\("is_placeholder", false\)/);
});

test("existing title resolution carries placeholder labels through Live, MC, and print views", () => {
  assert.match(liveSource, /guest_song:guest_song_id \([\s\S]*title/);
  assert.match(mcSource, /guest_song:guest_song_id \([\s\S]*title/);
  assert.match(printSource, /guest_song:guest_song_id \(title\)/);
  assert.match(showPageSource, /normalizeSetlistSong/);
  assert.match(showPageSource, /sortSetlistSongs/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = () => readFile(path.join(root, "app/components/show-page.tsx"), "utf8");
const migration = () => readFile(path.join(root, "supabase/migrations/20260929_link_rehearsal_entries_to_setlist_entries.sql"), "utf8");

test("rehearsal links only to an exact official setlist entry", async () => {
  const value = await source();
  assert.match(value, /setlist_entry_id/);
  assert.match(value, /candidates\.length === 1/);
  assert.doesNotMatch(value, /safeLegacyLinks[\s\S]{0,800}normalizeLooseSongTitle/);
});

test("official setlist entries are created as supplemental rehearsal rows and displayed in official order", async () => {
  const value = await source();
  assert.match(value, /const missingOfficialEntries = normalizedSetlist\.filter/);
  assert.match(value, /setlist_entry_id: entry\.id/);
  assert.match(value, /const officialEntries = setlist\.flatMap/);
  assert.match(value, /return \[\.\.\.officialEntries, \.\.\.sortRehearsalEntries\(practiceOnlyEntries\)\]/);
  assert.match(value, /rehearsalDisplayEntries\.map/);
});

test("practice-only rehearsal songs, notes, and recordings remain intact", async () => {
  const value = await source();
  assert.match(value, /!entry\.setlist_entry_id \|\| !officialSetlistById\.has\(entry\.setlist_entry_id\)/);

  assert.match(value, /rehearsal_recordings/);
});

test("legacy sync promotes only practice-only entries and records the exact link", async () => {
  const value = await source();
  assert.match(value, /const practiceOnlyEntries = rehearsalEntries\.filter\(\(entry\) => !entry\.setlist_entry_id\)/);
  assert.match(value, /The official show setlist is already the rehearsal list/);
  assert.match(value, /update\(\{ setlist_entry_id: link\.setlistEntryId \}\)/);
});

test("migration is additive and preserves history if a setlist entry is removed", async () => {
  const value = await migration();
  assert.match(value, /add column if not exists setlist_entry_id uuid/);
  assert.match(value, /references public\.setlist_entries\(id\)/);
  assert.match(value, /on delete set null/);
});

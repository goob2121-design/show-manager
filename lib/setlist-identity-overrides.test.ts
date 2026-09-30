import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { resolveLeadVocal, resolveSongKey } from "./song-resolvers";

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), "utf8");

test("identity overrides are additive and nullable", async () => {
  const migration = await read("supabase/migrations/20260930_add_setlist_identity_overrides.sql");
  assert.match(migration, /add column if not exists key_override text/);
  assert.match(migration, /add column if not exists sung_by_override text/);
  assert.doesNotMatch(migration, /default|update|insert/i);
});

test("shared resolver gives setlist overrides precedence and preserves the existing fallback", async () => {
  const source = await read("lib/song-resolvers.ts");
  assert.match(source, /clean\(entry\.key_override\) \?\? clean\(librarySong\?\.key\) \?\? clean\(guestSong\?\.key\) \?\? clean\(guestSong\?\.song_key\) \?\? clean\(entry\.key\) \?\? clean\(entry\.song_key\) \?\? null/);
  assert.match(source, /clean\(entry\.sung_by_override\) \?\? clean\(librarySong\?\.sung_by\) \?\? clean\(guestSong\?\.sung_by\) \?\? clean\(entry\.sung_by\) \?\? clean\(guestSong\?\.submitted_by_name\) \?\? null/);
});

test("library and guest overrides are isolated per setlist entry and null preserves today’s fallback", () => {
  const library = { library_song: { key: "D", sung_by: "Library Lead" } };
  const guest = { guest_song: { key: "G", sung_by: "Guest Lead", submitted_by_name: "Guest Submitter" } };

  assert.equal(resolveSongKey(library), "D");
  assert.equal(resolveLeadVocal(library), "Library Lead");
  assert.equal(resolveSongKey({ ...library, key_override: "E" }), "E");
  assert.equal(resolveLeadVocal({ ...library, sung_by_override: "Show Lead" }), "Show Lead");
  assert.equal(resolveSongKey({ ...guest, key_override: "A" }), "A");
  assert.equal(resolveLeadVocal({ ...guest, sung_by_override: "Guest Show Lead" }), "Guest Show Lead");
  assert.equal(resolveSongKey({ ...guest, key_override: "   " }), "G");
  assert.equal(resolveLeadVocal({ ...guest, sung_by_override: "   " }), "Guest Lead");
  assert.equal(resolveLeadVocal({ guest_song: { submitted_by_name: "Fallback Guest" } }), "Fallback Guest");
});
test("all official-performance consumers use the shared resolver", async () => {
  const [showPage, performanceSetup, liveMode, mc] = await Promise.all([
    read("app/components/show-page.tsx"),
    read("app/components/performance-setup-page.tsx"),
    read("app/components/band-live-page.tsx"),
    read("app/components/mc-page.tsx"),
  ]);
  assert.match(showPage, /resolveSongKey\(song\)/);
  assert.match(showPage, /resolveLeadVocal\(song\)/);
  assert.match(performanceSetup, /key_override, sung_by_override/);
  assert.match(performanceSetup, /update\(\{ key_override, sung_by_override \}\)/);
  assert.match(liveMode, /key_override,/);
  assert.match(liveMode, /sung_by_override,/);
  assert.match(mc, /resolveSongKey\(song\)/);
  assert.match(mc, /resolveLeadVocal\(song\)/);
});

test("official rehearsal identity remains resolved from the setlist while practice-only fields stay editable", async () => {
  const source = await read("app/components/show-page.tsx");
  assert.match(source, /entry\.setlist_entry_id \|\| entry\.is_library_linked \? entry\.key : nextKey/);
  assert.match(source, /disabled=\{Boolean\(entry\.setlist_entry_id\)\}/);
  assert.match(source, /!entry\.setlist_entry_id \|\| !officialSetlistById\.has\(entry\.setlist_entry_id\)/);
});
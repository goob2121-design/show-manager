import assert from "node:assert/strict";
import test from "node:test";
const { loadFootswitchSongLibrary, combineFootswitchSongs } = await import(new URL("./footswitch-song-library.ts", import.meta.url).href) as typeof import("./footswitch-song-library");
type LibraryClient = Parameters<typeof loadFootswitchSongLibrary>[0];
type LibraryRow = Parameters<typeof combineFootswitchSongs>[0][number];
type GuestRow = Parameters<typeof combineFootswitchSongs>[1][number];

function clientWith(rows: { library?: unknown[]; guests?: unknown[]; error?: string }) {
  const calls: unknown[][] = [];
  const client = { from(table: string) {
    const query = {
      select(value: string) { calls.push([table, "select", value]); return query; },
      order(field: string) { calls.push([table, "order", field]); return query; },
      eq(field: string, value: string) { calls.push([table, "eq", field, value]); return query; },
      range(start: number, end: number) { calls.push([table, "range", start, end]); return Promise.resolve({ data: (table === "songs" ? rows.library : rows.guests)?.slice(start, end + 1) ?? [], error: rows.error ? { message: rows.error } : null }); },
    };
    return query;
  } } as unknown as LibraryClient;
  return { client, calls };
}

test("empty setlists still expose the full authorized library, including songs beyond the first batch", async () => {
  const original = "  VERSE\r\n[C] Exact!\r\n\r\nCHORUS\r\nRepeat\r\n";
  const rows = Array.from({ length: 1001 }, (_, index) => ({ id: `song-${index}`, title: `Song ${index}`, lyrics: index === 1000 ? original : null }));
  const { client, calls } = clientWith({ library: rows });
  const loaded = await loadFootswitchSongLibrary(client);
  const songs = combineFootswitchSongs(loaded.library, loaded.guests, []);
  assert.equal(songs.length, 1001);
  assert.equal(songs.find((song) => song.id === "library:song-1000")?.lyrics, original);
  assert.ok(calls.some((call) => call[1] === "range" && call[2] === 1000));
  assert.equal(calls.some((call) => call[1] === "eq"), false, "The library must not be limited by show/setlist membership");
});

test("guest access stays show-scoped and linked entries are deduplicated with old selection aliases", async () => {
  const { client, calls } = clientWith({ library: [{ id: "lib", title: "Library", lyrics: "[G] Original" }], guests: [{ id: "guest", show_id: "show", title: "Guest", lyrics: " Guest! " }] });
  const loaded = await loadFootswitchSongLibrary(client, "show");
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["show_guest_songs", "eq", "show_id", "show"])));
  const songs = combineFootswitchSongs(loaded.library, loaded.guests, [{ id: "old-entry", songId: "lib", title: "Override", lyrics: "Old" }, { id: "guest-entry", guestSongId: "guest", title: "Guest", lyrics: "Old" }, { id: "custom", title: "Custom", lyrics: null }]);
  assert.equal(songs.length, 3);
  assert.deepEqual(songs.find((song) => song.id === "library:lib")?.aliases, ["old-entry"]);
  assert.equal(songs.find((song) => song.id === "library:lib")?.lyrics, "[G] Original");
  assert.equal(songs.find((song) => song.id === "guest:guest")?.lyrics, " Guest! ");
});

test("loading errors are surfaced rather than reported as an empty library", async () => {
  const { client } = clientWith({ error: "permission denied" });
  await assert.rejects(loadFootswitchSongLibrary(client), /Could not load StageFlow song library: permission denied/);
  assert.deepEqual(await loadFootswitchSongLibrary(clientWith({}).client), { library: [], guests: [] });
});

test("library and guest identities stay distinct and input song data is never changed", () => {
  const library = Object.freeze([Object.freeze({ id: "same", title: "Library", lyrics: "  original\n\n[C] ! " } as LibraryRow)]);
  const guests = Object.freeze([Object.freeze({ id: "same", title: "Guest", lyrics: null } as GuestRow)]);
  const songs = combineFootswitchSongs(library, guests, []);
  assert.equal(new Set(songs.map((song) => song.id)).size, 2);
  assert.equal(songs.find((song) => song.kind === "Library")?.lyrics, library[0].lyrics);
  assert.equal(songs.find((song) => song.kind === "Guest")?.lyrics, null);
});

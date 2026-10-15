import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

function compile(path, modules = {}, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: (name) => modules[name], ...globals });
  return exports;
}
const { groupCatalog, catalogSections, catalogReadiness, catalogHtml } = compile("lib/song-catalog.ts");
const row = (id, key = "A", tempo = "fast", song_type = "vocal", title = id) => ({ id, key, tempo, song_type, title });

test("every song appears once, in section/key/speed/title order, without mutation", () => {
  const songs = [row("z"), row("a"), row("slow", "A", "slow"), row("medium", "A", "medium"), row("inst", "B", "fast", "instrumental"), row("unknown", null, null, null), row("missing", "A", null), row("flat", "Bb"), row("sharp", "C#"), row("minor", "Am"), row("odd", "D modal", "unexpected"), row("natural", "C")];
  const before = JSON.stringify(songs);
  const sections = groupCatalog(songs);
  assert.deepEqual(Array.from(sections, (s) => s.title), ["VOCAL SONGS", "INSTRUMENTALS", "UNCLASSIFIED SONGS"]);
  const keys = sections[0].keys;
  assert.deepEqual(Array.from(keys, (k) => k.title), ["KEY OF C", "KEY OF C#", "KEY OF A", "KEY OF Am", "KEY OF Bb", "KEY OF D modal"]);
  const a = keys[2];
  assert.deepEqual(Array.from(a.speeds, (s) => s.title), ["FAST", "MEDIUM", "SLOW", "UNASSIGNED SPEED"]);
  assert.deepEqual(Array.from(a.speeds[0].songs, (s) => s.id), ["a", "z"]);
  const ids = sections.flatMap((s) => s.keys.flatMap((k) => k.speeds.flatMap((g) => g.songs.map((s) => s.id))));
  assert.equal(ids.length, songs.length);
  assert.equal(new Set(ids).size, songs.length);
  assert.equal(sections[2].keys[0].title, "UNASSIGNED KEY");
  assert.ok(sections.every((s) => s.keys.every((k) => k.speeds.every((g) => g.songs.length))));
  assert.equal(JSON.stringify(songs), before);
});

test("report escapes stored values and specifies isolated Letter three-column print layout", () => {
  const html = catalogHtml([row("x", "<key>", null, null, '<script>alert("x")</script>' + "long".repeat(100))]);
  assert.ok(!html.includes('<script>alert("x")'));
  for (const expected of ["&lt;script&gt;", "&lt;key&gt;", "size: letter portrait", "grid-template-columns: repeat(3", "width: 8.5in; height: 11in", "overflow-wrap: anywhere", "break-inside: avoid", "break-after: avoid", "nav { display: none; }", 'onclick="window.print()">Print', 'onclick="window.print()">Save as PDF', "window.close()", "SONGS NEEDING ATTENTION"]) assert.ok(html.includes(expected), expected);
  assert.match(catalogHtml([]), /No songs in the Song Library/);
});

test("readiness counts each incomplete song once and reports every missing field without changing data", () => {
  const songs = [row("ready"), row("key", "  "), row("speed", "B", null), row("type", "C", "slow", null), row("all", null, null, null), row("invalid", "K flat", "unknown", "other"), row("free-key", "D modal")];
  const before = JSON.stringify(songs);
  const result = catalogReadiness(songs);
  assert.equal(result.total, 7);
  assert.equal(result.ready.length, 2);
  assert.equal(result.attention.length, 5);
  assert.equal(result.attention.find(entry => entry.song.id === "all").missing.length, 3);
  assert.equal(result.attention.find(entry => entry.song.id === "invalid").missing.length, 2);
  assert.equal(JSON.stringify(songs), before);
  const html = catalogHtml(songs);
  assert.ok(html.includes("7 total | 2 ready | 5 need attention"));
  assert.match(html, /id="include-incomplete" type="checkbox">/);
  assert.ok(html.includes("Show Songs Needing Attention (5)"));
});

test("speed-first sections keep Slow/Medium/Fast fixed and separate missing keys and speeds", () => {
  const songs = [row("slow-b", "B", "slow"), row("slow-c", "C", "slow"), row("medium", "A", "medium"), row("fast-z", "A", "fast", "vocal", "Zebra"), row("fast-a", "A", "fast", "vocal", "Apple"), row("no-key", null, "fast"), row("no-speed", "D", null), row("neither", null, null), row("inst", "Bb", "fast", "instrumental"), row("unknown", "G#m", "slow", null)];
  const sections = catalogSections(songs);
  assert.deepEqual(Array.from(sections, section => section.title), ["VOCAL SONGS", "INSTRUMENTALS", "UNCLASSIFIED SONGS"]);
  assert.deepEqual(Array.from(sections[0].columns, column => column.label), ["SLOW", "MEDIUM", "FAST"]);
  assert.deepEqual(Array.from(sections[0].columns[0].keys, key => key.title), ["KEY OF C", "KEY OF B"]);
  assert.deepEqual(Array.from(sections[0].columns[2].keys[0].songs, song => song.id), ["fast-a", "fast-z"]);
  assert.equal(sections[0].unassignedKeys[2].keys[0].songs[0].id, "no-key");
  assert.deepEqual(Array.from(sections[0].unassignedSpeeds, key => key.title), ["KEY OF D", "UNASSIGNED KEY"]);
  const ids = sections.flatMap(section => [...section.columns, ...section.unassignedKeys].flatMap(column => column.keys.flatMap(key => key.songs.map(song => song.id))).concat(section.unassignedSpeeds.flatMap(key => key.songs.map(song => song.id))));
  assert.equal(ids.length, songs.length);
  assert.equal(new Set(ids).size, songs.length);
  assert.ok(sections.every(section => section.columns.every(column => column.keys.every(key => key.songs.length && key.title !== "UNASSIGNED KEY"))));
});

test("opening reads all batches independently of library filters and performs no writes", async () => {
  const rows = Array.from({ length: 1201 }, (_, i) => row(String(i)));
  const ranges = [];
  let rendered;
  const preview = { document: { body: {}, open() {}, write(html) { rendered = html; }, close() {} } };
  const query = { select(fields) { assert.equal(fields, "id,title,key,tempo,song_type"); return this; }, order(field) { assert.equal(field, "id"); return this; }, async range(start, end) { ranges.push([start, end]); return { data: rows.slice(start, end + 1), error: null }; } };
  const { PrintSongCatalogButton } = compile("app/components/print-song-catalog-button.tsx", {
    react: { useState: (value) => [value, () => {}] },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "@/lib/supabase/client": { createClient: () => ({ from: (table) => { assert.equal(table, "songs"); return query; } }) },
    "@/lib/song-catalog": { catalogHtml: (songs) => { assert.equal(songs.length, 1201); return "complete"; } },
  }, { window: { open: () => preview } });
  await PrintSongCatalogButton().props.children[0].props.onClick();
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);
  assert.equal(rendered, "complete");
});

test("catalog excludes the separate guest source, retains shared library songs, and reloads classifications on every opening", async () => {
  const regular = { ...row("band", "A", "fast", "vocal", "Regular band song"), created_by_role: "band" };
  const shared = { ...row("shared", "B", "slow", "vocal", "Shared song"), created_by_role: "admin", notes: "Guest: Guest Performer", sung_by: "Guest Performer" };
  const unassigned = row("not-in-current-show", "C", "medium", "instrumental", "Not assigned to this show");
  const guests = [row("guest-only", "D", "fast", "vocal", "Guest exclusive"), row("guest-shared", "B", "slow", "vocal", "Shared song")];
  let library = [regular, shared, unassigned];
  const reads = [];
  const reports = [];
  const previews = [];
  const client = { from(table) {
    reads.push(table);
    assert.equal(table, "songs", "Only the reusable library is an eligible source");
    return {
      select(fields) { assert.equal(fields, "id,title,key,tempo,song_type"); return this; },
      order(field) { assert.equal(field, "id"); return this; },
      async range(start, end) { return { data: (table === "songs" ? library : guests).slice(start, end + 1), error: null }; },
    };
  } };
  const { PrintSongCatalogButton } = compile("app/components/print-song-catalog-button.tsx", {
    react: { useState: (value) => [value, () => {}] },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "@/lib/supabase/client": { createClient: () => client },
    "@/lib/song-catalog": { catalogHtml: (songs) => { reports.push(songs); return catalogHtml(songs); } },
  }, { window: { open: () => { const preview = { document: { body: {}, open() {}, write(html) { this.html = html; }, close() {} } }; previews.push(preview); return preview; } } });
  const open = PrintSongCatalogButton().props.children[0].props.onClick;
  await open();
  assert.deepEqual(Array.from(reports[0], song => song.id), ["band", "shared", "not-in-current-show"]);
  assert.ok(!previews[0].document.html.includes("Guest exclusive"));
  assert.equal((previews[0].document.html.match(/<p data-song-id="shared">Shared song<\/p>/g) ?? []).length, 1);
  const sharedBefore = JSON.stringify(shared);
  // Simulate a later database response without writing any song records.
  library = [regular, { ...shared, key: "Bb", tempo: "fast", song_type: "instrumental" }, unassigned, row("new", null, null, null, "New library song")];
  await open();
  assert.deepEqual(reads, ["songs", "songs"]);
  const groups = groupCatalog(reports[1]);
  const updatedGroup = groups.find(section => section.title === "INSTRUMENTALS").keys.find(key => key.title === "KEY OF Bb");
  assert.equal(updatedGroup.speeds[0].title, "FAST");
  assert.equal(updatedGroup.speeds[0].songs[0].id, "shared");
  assert.ok(previews[1].document.html.includes("New library song"));
  assert.equal(JSON.stringify(shared), sharedBefore);
});

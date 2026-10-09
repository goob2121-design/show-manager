import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(path, "utf8");
function compile(source, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, ...globals });
  return exports;
}
const resolver = compile(read("lib/song-resolvers.ts"));
const setup = read("app/components/performance-setup-page.tsx");
const admin = read("app/components/show-page.tsx");
function declaration(source, name) {
  const ast = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(result, name);
  return result;
}
const arrangement = "  Banjo Kick, Mando, Guitar/Fiddle, Banjo\nBanjo Outro  ";
test("null, empty and whitespace overrides inherit the exact library default; explicit overrides win", () => {
  for (const override of [undefined, null, "", " \n\t "]) {
    assert.equal(resolver.resolvePerformanceFlow({ performance_flow: override, library_song: [{ default_performance_flow: arrangement }] }), arrangement);
  }
  const override = "Fiddle/Guitar, Banjo, Tag";
  assert.equal(resolver.resolvePerformanceFlow({ performance_flow: override, library_song: { default_performance_flow: arrangement } }), override);
  assert.equal(resolver.resolvePerformanceFlow({ library_song: { default_performance_flow: " \n" } }), null);
  assert.equal(resolver.resolvePerformanceFlow({ performance_flow: override, guest_song: {} }), override);
});

test("unchanged inherited saves remain null, existing overrides survive and intentional edits become overrides", () => {
  assert.equal(resolver.performanceFlowOverrideForSave(arrangement, arrangement, null), null);
  assert.equal(resolver.performanceFlowOverrideForSave(arrangement, arrangement, " \n"), null);
  assert.equal(resolver.performanceFlowOverrideForSave(arrangement, arrangement, arrangement), arrangement);
  assert.equal(resolver.performanceFlowOverrideForSave("Fiddle/Banjo, Tag", arrangement, null), "Fiddle/Banjo, Tag");
  assert.equal(resolver.performanceFlowOverrideForSave(" \n", arrangement, arrangement), null);
});

function setupHarness(song, draft, fail = false) {
  const writes = [];
  let songs = [song, { id: "other", performanceFlow: "Other show" }], drafts = { [song.id]: draft };
  const globals = { ...resolver, flowDrafts: drafts, introDrafts: {}, lyricsDrafts: {},
    setSavingId: () => {}, setMessage: () => {}, setError: () => {},
    setSongs: (update) => { songs = update(songs); }, setFlowDrafts: (update) => { drafts = update(drafts); },
    createClient: () => ({ from: (table) => ({ update: (payload) => ({ eq: async (column, id) => {
      writes.push({ table, payload: { ...payload }, column, id }); return { error: fail ? new Error("Denied") : null };
    } }) }) }),
  };
  const handlers = compile(`${declaration(setup, "saveText")}\n${declaration(setup, "clearPerformanceFlowOverride")}\nexport { saveText, clearPerformanceFlowOverride };`, globals);
  return { handlers, writes, song: () => songs[0], other: () => songs[1], draft: () => drafts[song.id] };
}
const inheritedSong = { id: "entry", sourceType: "library", title: "Song", performanceFlow: arrangement, performanceFlowOverride: null, libraryPerformanceFlow: arrangement };
test("Performance Setup Save preserves inheritance and saves deliberate edits to the current entry", async () => {
  const inherited = setupHarness(inheritedSong, arrangement);
  await inherited.handlers.saveText(inheritedSong);
  assert.equal(inherited.writes[0].table, "setlist_entries");
  assert.equal(inherited.writes[0].payload.performance_flow, null);
  assert.equal(inherited.song().performanceFlow, arrangement);
  const edited = setupHarness(inheritedSong, "Banjo/Fiddle, Outro");
  await edited.handlers.saveText(inheritedSong);
  assert.equal(edited.writes[0].payload.performance_flow, "Banjo/Fiddle, Outro");
  assert.equal(edited.song().performanceFlowOverride, "Banjo/Fiddle, Outro");
  assert.equal(edited.other().performanceFlow, "Other show");
});
test("Use Library Default clears only the current arrangement and updates the effective draft; failure retains override", async () => {
  const song = { ...inheritedSong, performanceFlow: "Solo, Tag", performanceFlowOverride: "Solo, Tag" };
  const h = setupHarness(song, "Unsaved change");
  await h.handlers.clearPerformanceFlowOverride(song);
  assert.deepEqual(h.writes, [{ table: "setlist_entries", payload: { performance_flow: null }, column: "id", id: "entry" }]);
  assert.equal(h.song().performanceFlowOverride, null);
  assert.equal(h.song().performanceFlow, arrangement);
  assert.equal(h.draft(), arrangement);
  assert.equal(h.other().performanceFlow, "Other show");
  const failed = setupHarness(song, "Solo, Tag", true);
  await failed.handlers.clearPerformanceFlowOverride(song);
  assert.equal(failed.song().performanceFlowOverride, "Solo, Tag");
});
test("both Performance Setup queries and the Live/admin setlist queries load the library default", () => {
  for (const source of [setup, read("app/components/band-live-page.tsx"), admin]) {
    const join = source.match(/library_song:song_id\s*\(([^)]*)\)/)?.[1];
    assert.match(join, /default_performance_flow/);
  }
  assert.match(setup.slice(setup.indexOf("const LEGACY_PERFORMANCE_SETUP_SELECT"), setup.indexOf("type SectionKey")), /default_performance_flow/);
  assert.match(setup, /Inherited from Song Library/);
  assert.match(setup, /Show-specific override/);
  for (const name of ["handleSaveAdminSongLiveSetup", "handleSaveSetlistSong"]) assert.match(declaration(admin, name), /performanceFlowOverrideForSave/);
});
test("new library songs and rehearsal-linked songs omit arrangement overrides and inherit dynamically", () => {
  const add = declaration(admin, "handleAddLibrarySongToSection");
  const insertion = add.match(/\.insert\(\{([\s\S]*?)\}\)/)?.[1];
  assert.match(insertion, /song_id: songToPlace.id/);
  assert.doesNotMatch(insertion, /performance_flow|buildSetlistInsertDefaults/);
  assert.match(add, /default_performance_flow/);
  assert.doesNotMatch(admin, /These defaults are copied into a show/);
  assert.match(admin, /song_id: target.songId,\s*\}\)/);
});
test("show duplication preserves explicit arrangements verbatim and leaves inherited entries without overrides", () => {
  const source = read("app/shows/page.tsx");
  const ast = ts.createSourceFile("duplicate.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let mapping;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "typedSetlist.map") mapping = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(mapping);
  const { copy } = compile(`export function copy(typedSetlist, createdShow, guestSongIdMap) { return ${mapping}; }`);
  const result = copy([{ source_type: "library", song_id: "song", performance_flow: arrangement }, { source_type: "library", song_id: "other", performance_flow: null }], { id: "new-show" }, new Map());
  assert.equal(result[0].performance_flow, arrangement);
  assert.equal(result[0].show_id, "new-show");
  assert.equal(result[1].performance_flow, null);
});

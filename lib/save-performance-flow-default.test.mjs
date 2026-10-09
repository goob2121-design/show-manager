import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(path, "utf8");
function compile(source, globals = {}, modules = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: (name) => modules[name] ?? require(name), ...globals });
  return exports;
}
const resolver = compile(read("lib/song-resolvers.ts"));
const api = compile(read("lib/save-performance-flow-default.ts"), {}, { "./song-resolvers": resolver });
const original = "  Fiddle Kick, Banjo, Mando , Guitar/Banjo\nTag  ";
function database(initial = null, options = {}) {
  let value = initial, reads = 0;
  const writes = [], attempts = [];
  const client = { from(table) {
    assert.equal(table, "songs");
    let payload, filter;
    const query = {
      select: () => query,
      update: (next) => { payload = next; return query; },
      eq: (field, expected) => { if (field === "id") assert.equal(expected, "song"); else { assert.equal(field, "default_performance_flow"); filter = expected; } return query; },
      is: (field, expected) => { assert.equal(field, "default_performance_flow"); assert.equal(expected, null); filter = expected; return query; },
      maybeSingle: async () => {
        if (!payload) { reads++; return { data: options.missing ? null : { id: "song", default_performance_flow: value }, error: null }; }
        assert.equal(Object.keys(payload).join(), "default_performance_flow");
        assert.notEqual(filter, undefined, "Every update must contain an atomic default-value condition");
        attempts.push({ filter, arrangement: payload.default_performance_flow });
        if (options.beforeUpdate) { value = options.beforeUpdate; options.beforeUpdate = null; }
        if (options.error) return { data: null, error: new Error("Denied") };
        if (value !== filter || options.blocked) return { data: null, error: null };
        value = payload.default_performance_flow; writes.push(value);
        return { data: { id: "song", default_performance_flow: value }, error: null };
      },
    };
    return query;
  } };
  return { client, writes, attempts, value: () => value, reads: () => reads };
}
test("promotion writes only the default and preserves exact spaces, punctuation and newlines", async () => {
  for (const empty of [null, "", " \n\t "]) {
    const db = database(empty);
    const result = await api.savePerformanceFlowDefault(db.client, "song", original);
    assert.equal(result.saved, true);
    assert.equal(db.value(), original);
    assert.equal(db.attempts[0].filter, empty);
  }
});
test("empty input and existing nonempty defaults cannot produce writes", async () => {
  for (const text of ["", " \n\t"]) {
    const db = database();
    await assert.rejects(api.savePerformanceFlowDefault(db.client, "song", text), /Enter a Performance Flow/);
    assert.equal(db.reads(), 0);
  }
  const db = database("June arrangement");
  const result = await api.savePerformanceFlowDefault(db.client, "song", original);
  assert.equal(result.saved, false);
  assert.equal(result.song.default_performance_flow, "June arrangement");
  assert.equal(db.attempts.length, 0);
});
test("another user's intervening save is rejected atomically and its value is refreshed", async () => {
  const db = database(null, { beforeUpdate: "Another user's default" });
  const result = await api.savePerformanceFlowDefault(db.client, "song", original);
  assert.equal(result.saved, false);
  assert.equal(result.song.default_performance_flow, "Another user's default");
  assert.equal(db.value(), "Another user's default");
  assert.equal(db.writes.length, 0);
  assert.equal(db.reads(), 2);
});
test("two concurrent promotions permit exactly one winner", async () => {
  const db = database(" \n");
  const results = await Promise.all([api.savePerformanceFlowDefault(db.client, "song", original), api.savePerformanceFlowDefault(db.client, "song", "Other arrangement")]);
  assert.equal(results.filter((result) => result.saved).length, 1);
  assert.equal(db.attempts.length, 2, "Both requests read the empty value before competing conditional updates");
  assert.equal(db.writes.length, 1);
  assert.equal(results.find((result) => !result.saved).song.default_performance_flow, db.value());
});
test("missing records, permission failures and silent blocked updates report errors", async () => {
  for (const [options, pattern] of [[{ missing: true }, /could not be loaded/], [{ error: true }, /Denied/], [{ blocked: true }, /was not saved/]]) {
    const db = database(null, options);
    await assert.rejects(api.savePerformanceFlowDefault(db.client, "song", original), pattern);
    assert.equal(db.writes.length, 0);
  }
});
test("December inherits promoted October arrangement while October and June overrides remain exact", async () => {
  const october = { performance_flow: original }, june = { performance_flow: "June separate override" }, december = { performance_flow: null };
  const before = JSON.stringify([october, june, december]);
  const db = database();
  await api.savePerformanceFlowDefault(db.client, "song", original);
  const resolve = (entry) => resolver.resolvePerformanceFlow({ ...entry, library_song: { default_performance_flow: db.value() } });
  assert.equal(resolve(december), original);
  assert.equal(resolve(october), original);
  assert.equal(resolve(june), "June separate override");
  assert.equal(JSON.stringify([october, june, december]), before);
  assert.equal(api.savedPerformanceFlowSource(october.performance_flow, db.value()), "Show Override");
  assert.equal(api.savedPerformanceFlowSource(null, db.value()), "Library Default");
  assert.equal(api.savedPerformanceFlowSource(" \n", " \n"), "Not Set");
});

const source = read("app/components/show-page.tsx");
function handler() {
  const ast = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === "handlePromoteSetlistPerformanceFlow") declaration = node.getText(ast); ts.forEachChild(node, visit); }
  visit(ast); assert.ok(declaration);
  return declaration;
}
function promotionHarness(confirmed = true, result = { saved: true, song: { default_performance_flow: original } }) {
  const entry = { id: "october", source_type: "library", song_id: "song", performance_flow: "Saved October override", library_song: { id: "song", default_performance_flow: null } };
  const form = { performanceFlow: original, customTitle: "Unsaved title", songIntroNotes: "Unsaved notes" };
  let entries = [entry, { id: "june", song_id: "song", performance_flow: "June override" }], songs = [{ id: "song", default_performance_flow: null }], defaults = { song: { performanceFlow: "", songIntroNotes: "Keep defaults notes" } }, calls = 0, status;
  const globals = { ...api, ...resolver, setlist: entries, songLibrary: songs, setlistSongEditFormState: form,
    libraryDefaultPromotionPending: { current: false }, canEditLibrarySong: () => true,
    window: { confirm: (message) => { assert.match(message, /permanent Song Library default/); return confirmed; } },
    setLibraryDefaultPromotion: (value) => { status = value; },
    createClient: () => ({}), savePerformanceFlowDefault: async (_client, id, text) => { calls++; assert.equal(id, "song"); assert.equal(text, original); return result; },
    setSongLibrary: (update) => { songs = update(songs); }, setSetlist: (update) => { entries = update(entries); },
    setAdminSongPerformanceDefaultsDrafts: (update) => { defaults = update(defaults); }, buildAdminSongPerformanceDefaultsDraft: () => ({}), getErrorMessage: (error) => error.message,
  };
  const { handlePromoteSetlistPerformanceFlow } = compile(handler() + "\nexport { handlePromoteSetlistPerformanceFlow };", globals);
  return { run: () => handlePromoteSetlistPerformanceFlow("october"), form, calls: () => calls, entries: () => entries, defaults: () => defaults, status: () => status, songs: () => songs };
}
test("promotion refreshes local defaults without saving or resetting any Edit Song draft or show override", async () => {
  const h = promotionHarness();
  const before = JSON.stringify(h.form);
  await h.run();
  assert.equal(h.calls(), 1);
  assert.equal(JSON.stringify(h.form), before);
  assert.equal(h.entries()[0].performance_flow, "Saved October override");
  assert.equal(h.entries()[1].performance_flow, "June override");
  assert.equal(h.entries()[1].library_song.default_performance_flow, original);
  assert.equal(h.defaults().song.songIntroNotes, "Keep defaults notes");
  assert.match(h.status().message, /saved as Library Default/);
  assert.doesNotMatch(handler(), /handleSaveSetlistSong|setSetlistSongEditFormState|setEditingSetlistSongId/);
});
test("cancel does nothing; conflict refreshes displayed default and explains refusal", async () => {
  const cancelled = promotionHarness(false);
  await cancelled.run();
  assert.equal(cancelled.calls(), 0);
  assert.equal(cancelled.status(), undefined);
  const conflict = promotionHarness(true, { saved: false, song: { default_performance_flow: "Concurrent default" } });
  await conflict.run();
  assert.equal(conflict.songs()[0].default_performance_flow, "Concurrent default");
  assert.equal(conflict.status().message, api.EXISTING_LIBRARY_DEFAULT_MESSAGE);
});
test("promotion controls sit beneath the textarea, cannot submit forms, and hide for unlinked songs", () => {
  const editor = read("app/components/song-editor-panel.tsx");
  assert.match(editor, /placeholder={performanceFlowPlaceholder}[\s\S]*?<\/label>\s*{performanceFlowActions}/);
  assert.match(source, /song.source_type === "library" && song.song_id && songLibrary.some/);
  const button = source.match(/<button type="button" onClick={\(\) => handlePromoteSetlistPerformanceFlow\(song.id\)}[^>]*>/)?.[0];
  assert.ok(button);
  assert.match(button, /disabled={!setlistSongEditFormState.performanceFlow.trim\(\)/);
});

test("both expanded and collapsible editors render the action after the textarea outside its label", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { SongEditorPanel } = compile(read("app/components/song-editor-panel.tsx"));
  for (const detailsSummaryLabel of [undefined, "Song Details"]) {
    const markup = renderToStaticMarkup(React.createElement(SongEditorPanel, {
      formState: { performanceFlow: original, songIntroNotes: "Keep notes" }, onChange: () => {}, footer: null,
      showTitle: false, showKey: false, showLeadVocal: false, showTempo: false, showSongType: false, showNotes: false, showLyrics: false,
      performanceFlowField: true, songIntroNotesField: true, detailsSummaryLabel,
      performanceFlowActions: React.createElement("button", { type: "button" }, "Save as Library Default"),
    }));
    assert.match(markup, /<\/textarea><\/label><button type="button">Save as Library Default<\/button>/);
    assert.ok(markup.indexOf("Save as Library Default") < markup.indexOf("Song Intro Notes"));
    assert.ok(markup.includes("Keep notes"));
  }
});

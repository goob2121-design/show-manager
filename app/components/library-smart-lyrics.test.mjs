import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("./library-smart-lyrics.tsx", import.meta.url), "utf8");
function harness(alreadyFullscreen = false) {
  const states = [], refs = [], frames = new Map(), events = [], effects = [];
  let stateIndex = 0, refIndex = 0, frameId = 0, resolveExit;
  const doc = { documentElement: {}, getElementById: id => ({ focus: options => events.push(["focus", id, options.preventScroll]) }) };
  doc.fullscreenElement = alreadyFullscreen ? doc.documentElement : null;
  const page = { scrollX: 0, scrollY: 725, location: { href: "https://stageflow.test/songs?q=song" }, scrollTo: position => events.push(["scroll", position.top]), history: { state: { next: true }, replaceState: (_state, _unused, url) => events.push(["url", url]) } };
  const fullscreen = { status: { active: alreadyFullscreen }, request: () => events.push(["request"]), close: () => { events.push(["exit"]); return new Promise(resolve => { resolveExit = resolve; }); } };
  const react = { useState: initial => { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], next => { states[i] = typeof next === "function" ? next(states[i]) : next; }]; }, useRef: initial => { const i = refIndex++; return refs[i] ??= { current: initial }; }, useEffect: fn => effects.push(fn) };
  const exports = {};
  const modules = { react, "react-dom": { flushSync: fn => { fn(); events.push(["commit"]); } }, "./live-smart-lyrics": { LiveSmartLyrics() {} }, "./footswitch-fullscreen": { useDiagnosticFullscreen: () => fullscreen } };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: name => modules[name] ?? require(name), document: doc, window: page, requestAnimationFrame: fn => { const id = ++frameId; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id) });
  return { render() { stateIndex = refIndex = 0; return exports.useLibrarySmartLyrics(); }, events, page, doc, frames, finishExit() { resolveExit?.(); }, flushFrames() { for (const [id, fn] of frames) { frames.delete(id); fn(); } }, effects };
}

test("library sessions reuse the viewer and restore scroll, URL and focus after fullscreen closes", async () => {
  const h = harness();
  const song = Object.freeze({ id: "song", title: "Song", lyrics: "Original lyrics", key: "A" });
  h.render().open(song, "song-button");
  assert.deepEqual(h.events.slice(0, 3), [["request"], ["commit"], ["scroll", 0]]);
  const viewer = h.render().viewer;
  assert.equal(viewer.props.song, song);
  assert.equal(viewer.props.returnToLibrary, true);
  assert.equal(viewer.props.exitFullscreenOnClose, false);
  h.page.location.href += "#smart-lyric-paging-setup";
  viewer.props.onClose();
  assert.equal(h.render().viewer, null);
  h.flushFrames(); assert.ok(!h.events.some(event => event[0] === "scroll" && event[1] === 725));
  h.finishExit(); await new Promise(resolve => setImmediate(resolve)); h.flushFrames();
  assert.ok(h.events.some(event => event[0] === "scroll" && event[1] === 725));
  assert.ok(h.events.some(event => event[0] === "url" && event[1] === "https://stageflow.test/songs?q=song"));
  assert.deepEqual(h.events.at(-1), ["focus", "song-button", true]);
});

test("pre-existing fullscreen is preserved and stale closing work cannot scroll a newly opened song", async () => {
  const h = harness(true);
  const song = { id: "one", title: "One", lyrics: null };
  h.render().open(song, "one-button");
  h.render().viewer.props.onClose(); h.flushFrames();
  assert.ok(!h.events.some(event => ["request", "exit"].includes(event[0])));
  const pending = harness();
  pending.render().open(song, "one-button"); pending.render().viewer.props.onClose();
  pending.render().open({ ...song, id: "two" }, "two-button");
  pending.finishExit(); await new Promise(resolve => setImmediate(resolve)); pending.flushFrames();
  assert.equal(pending.render().viewer.props.song.id, "two");
  assert.ok(!pending.events.some(event => event[0] === "scroll" && event[1] === 725));
});

test("library hosts keep their state mounted and the standalone route requires no show", () => {
  const show = readFileSync(new URL("./show-page.tsx", import.meta.url), "utf8");
  const library = readFileSync(new URL("./music-library.tsx", import.meta.url), "utf8");
  assert.match(show, /if \(librarySmartLyrics.viewer\) return librarySmartLyrics.viewer/);
  assert.match(show, /Smart Lyrics<\/button>/);
  assert.match(library, /if \(smartLyrics.viewer\) return smartLyrics.viewer/);
  assert.doesNotMatch(library, /show_id|setlist_entries|show_guest_songs|\.insert\(|\.update\(|\.delete\(/);
});

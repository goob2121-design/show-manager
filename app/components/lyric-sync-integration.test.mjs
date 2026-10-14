import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url), read = path => readFileSync(new URL(path, import.meta.url), "utf8");
function compile(source, modules = {}, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports, require: name => modules[name] ?? require(name), crypto: webcrypto, TextEncoder, AbortSignal, Error, ...globals });
  return exports;
}
const layout = compile(read("../../lib/lyric-sync-layout.ts"));
const paging = compile(read("./footswitch-lyric-paging.ts"));
function hooks() {
  let index = 0; const slots = [], effects = [];
  const react = {
    useRef(value) { const i = index++; return slots[i] ??= { current: value }; },
    useState(value) { const i = index++; slots[i] ??= { value }; return [slots[i].value, next => { slots[i].value = typeof next === "function" ? next(slots[i].value) : next; }]; },
    useEffect(fn, deps) {
      const i = index++, previous = slots[i];
      if (!previous || deps.some((value, k) => value !== previous.deps[k])) {
        slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  return { react, render(fn) { index = 0; const view = fn(); effects.splice(0).forEach(fn => fn()); return view; }, destroy() { slots.forEach(slot => slot.cleanup?.()); } };
}
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 25)); };
const show = "11111111-1111-4111-8111-111111111111", song = { id: "entry-one", lyrics: "First verse\nSecond line\n\nChorus" };
function integration(h, modules, globals = {}) {
  return compile(read("./lyric-sync-integration.tsx"), { react: h.react, "@/lib/lyric-sync-client": modules.client,
    "@/lib/lyric-sync-layout": { ...layout, ...modules.layout } }, { setInterval: () => 1, clearInterval() {},
    window: new EventTarget(), process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key" } }, ...globals,
    ...(globals.window ? { window: globals.window instanceof EventTarget ? globals.window : Object.assign(new EventTarget(), globals.window) } : {}) });
}

test("leader reconnect resumes the ownership cookie without requesting another PIN", async () => {
  const h = hooks(), page = new EventTarget(); let report, owner = false, starts = 0, publishers = 0;
  const api = integration(h, { client: { createLyricSyncPublisher(_show, _sequence, notify) {
    report = notify; publishers++; return { publish() {}, destroy() {} };
  } }, layout: {} }, { window: page, fetch: async url => {
    if (url.includes("start")) { starts++; owner = true; }
    if (!owner) return Response.json({ error: "not owner" }, { status: 401 });
    return Response.json({ snapshot: { payload: JSON.stringify({ state: { sequence: 5 } }) } });
  } });
  const render = () => h.render(() => api.useLyricSyncLeader(show, true, song, false));
  try {
    const initial = render(); await tick(); await initial.start("654321"); assert.equal(render().active, true);
    report("disconnected"); assert.equal(render().active, false);
    page.dispatchEvent(new Event("online")); await tick(); assert.equal(render().active, true);
    assert.equal(starts, 1); assert.equal(publishers, 2);
  } finally { h.destroy(); }
});

test("wedge retries initial offline readiness after reconnect and cleans up its connection", async () => {
  const h = hooks(), page = new EventTarget(); let online = false, connects = 0, destroyed = 0;
  const api = integration(h, { client: {
    createIsolatedLyricSyncClient() { connects++; return { realtime: { disconnect() {} } }; },
    followLyricSync() { return { destroy() { destroyed++; } }; },
  }, layout: {} }, { window: page, fetch: async () => {
    if (!online) throw Error("offline"); return Response.json({ snapshot: null });
  } });
  try {
    h.render(() => api.useWedgeLyricSync(show, song, () => {})); await tick(); assert.equal(connects, 0);
    online = true; page.dispatchEvent(new Event("online")); await tick(); assert.equal(connects, 1);
    page.dispatchEvent(new Event("pageshow")); await tick(); assert.equal(connects, 1);
  } finally { h.destroy(); }
  assert.equal(destroyed, 1);
});
test("main iPad observes OPEN, forward/backward, calibration, manual and Auto-Close without scroll writes", async () => {
  const h = hooks(), sent = [], observers = []; let position = { section: 1, originalLine: 0, characterOffset: 0 }, calibrating = false;
  let opened = false, owner = false;
  const api = integration(h, { client: { createLyricSyncPublisher: () => ({ publish: value => sent.push(value), destroy() {} }) },
    layout: { observeSemanticLyrics(_doc, _page, report) { observers.push(report); report(); return () => {}; }, readLyricPosition: () => position } },
  { document: { getElementById: () => calibrating ? {} : null }, window: {},
    fetch: async url => { if (url.includes("status") && !owner) return Response.json({ error: "not owner" }, { status: 401 }); owner = true;
      return Response.json({ snapshot: { payload: JSON.stringify({ state: { sequence: 0 } }) } }); } });
  const render = () => h.render(() => api.useLyricSyncLeader(show, true, song, opened));
  try {
    let sync = render(); await tick(); await sync.start("654321"); sync = render(); assert.equal(sync.active, true);
    assert.equal(sent.at(-1).state, "closed");
    opened = true; render(); await tick(); assert.equal(sent.at(-1).state, "open");
    position = { section: 3, originalLine: 2, characterOffset: 0 }; observers.at(-1)(); assert.equal(sent.at(-1).position.section, 3);
    position = { section: 1, originalLine: 0, characterOffset: 0 }; observers.at(-1)(); assert.equal(sent.at(-1).position.section, 1);
    calibrating = true; observers.at(-1)(); assert.equal(sent.at(-1).state, "calibrating"); calibrating = false;
    const viewer = sent.at(-1).viewerSessionId;
    opened = false; render(); assert.equal(sent.at(-1).state, "closed"); assert.equal(sent.at(-1).viewerSessionId, viewer);
    // The existing Auto-Close callback sets exactly the same parent opened flag.
    opened = true; render(); await tick(); opened = false; render(); assert.equal(sent.at(-1).state, "closed");
    assert.ok(sent.every(value => !Object.hasOwn(value, "lyrics")));
  } finally { h.destroy(); }
});
test("ordinary band member creates no publisher or subscriptions", async () => {
  const h = hooks(); let requests = 0;
  const api = integration(h, { client: {}, layout: {} }, { fetch: async () => { requests++; throw Error(); } });
  try { h.render(() => api.useLyricSyncLeader(show, false, song, true)); await tick(); assert.equal(requests, 0); }
  finally { h.destroy(); }
});
test("wedge follows matching signed transport state, releases on Close, holds safely on disconnect and song changes", async () => {
  const h = hooks(); let receiver, status, alignments = 0, reveals = 0, selected = song, destroyed = 0;
  const api = integration(h, { client: { createIsolatedLyricSyncClient: () => ({ realtime: { disconnect() {} } }),
    followLyricSync(options) { receiver = options.onState; status = options.onStatus; return { destroy() { destroyed++; } }; } },
  layout: { observeSemanticLyrics(_doc, _page, report) { report(); return () => {}; }, alignWedgeLyrics() { alignments++; return true; } } },
  { fetch: async () => Response.json({ snapshot: null }), document: {}, window: {} });
  const render = () => h.render(() => api.useWedgeLyricSync(show, selected, () => { reveals++; }));
  try {
    render(); await tick(); render(); status("connected");
    const state = { state: "open", setlistEntryId: song.id, lyricsRevision: await layout.lyricRevision(song.lyrics),
      position: { section: 1, originalLine: 0, characterOffset: 0 } };
    receiver(state); assert.equal(render().following, true); await tick(); assert.ok(alignments > 0);
    receiver({ ...state, state: "closed", position: null }); assert.equal(render().following, false);
    const count = alignments; await tick(); assert.equal(alignments, count, "independent pedal scrolling has no alignment observer");
    receiver(state); render(); await tick(); status("disconnected"); assert.equal(render().following, false);
    const before = alignments; await tick(); assert.equal(alignments, before);
    status("connected"); render(); await tick(); assert.ok(alignments > before);
    selected = { id: "entry-two", lyrics: "Different song" }; assert.equal(render().following, false); await tick();
    assert.ok(reveals > 0);
  } finally { h.destroy(); }
  assert.equal(destroyed, 1);
});
test("missing configuration keeps Wedge Flow independent without a Realtime connection", async () => {
  const h = hooks(); let connects = 0;
  const api = integration(h, { client: { createIsolatedLyricSyncClient() { connects++; } }, layout: {} },
    { fetch: async () => Response.json({ error: "unavailable" }, { status: 503 }) });
  try { h.render(() => api.useWedgeLyricSync(show, song, () => {})); await tick(); assert.equal(connects, 0); }
  finally { h.destroy(); }
});
test("semantic page mapping preserves Unicode offsets across different font and pagination plans", () => {
  const text = "😀abcdef ghijkl mnopqrstuvwxyz";
  const sections = [text, "Chorus\nLast line"];
  const small = paging.paginateLyricSections(sections, { preferredFontSize: 32, minimumFontSize: 28, contentHeight: 200, measureLine: () => 20 });
  const large = paging.paginateLyricSections(sections, { preferredFontSize: 96, minimumFontSize: 28, contentHeight: 40, measureLine: text => Array.from(text).length * 10 });
  assert.ok(large.length > small.length);
  const anchors = paging.lyricLineAnchors(large); let offset = 0;
  large.forEach((page, index) => page.lines.forEach((line, j) => { if (page.section === 1) { assert.equal(anchors[index][j].characterOffset, offset); offset += Array.from(line.text).length; } }));
  assert.equal(offset, Array.from(text).length);
  function docFor(pages) {
    const anchors = paging.lyricLineAnchors(pages), nodes = [];
    pages.forEach((page, i) => page.lines.forEach((line, j) => nodes.push({ textContent: line.text,
      dataset: { lyricSection: String(page.section), lyricLine: String(line.originalLine), lyricOffset: String(anchors[i][j].characterOffset) },
      closest: () => ({ index: i, getBoundingClientRect: () => ({ top: i * 400 + 47 }) }) })));
    return { querySelectorAll: () => nodes, querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 47 }) }) };
  }
  const position = { section: 1, originalLine: 0, characterOffset: 20 };
  assert.equal(layout.lyricTargetPage(docFor(small), position).index, 0);
  assert.ok(layout.lyricTargetPage(docFor(large), position).index > 0);
  const moves = [], page = { scrollY: 0, scrollTo: options => moves.push(options) };
  const doc = docFor(large); layout.alignWedgeLyrics(doc, page, position);
  layout.alignWedgeLyrics(doc, page, { ...position, characterOffset: 0 });
  assert.ok(moves[0].top > 0); // Backward mapping also resolves to the first page.
  assert.equal(layout.lyricTargetPage(doc, { ...position, section: 99 }), null);
  const rotatedDoc = { ...doc, scrollingElement: { scrollHeight: 4000, clientHeight: 800 },
    querySelectorAll: () => [{ dataset: { lyricSection: "1", lyricLine: "0", lyricOffset: "0" }, textContent: "rotated lyrics",
      closest: () => ({ getAttribute: () => "1200", getBoundingClientRect: () => { throw Error("Rotated rectangles must not drive sync"); } }) }] };
  layout.alignWedgeLyrics(rotatedDoc, page, { section: 1, originalLine: 0, characterOffset: 0 });
  assert.equal(moves.at(-1).top, 1200);
});
test("shared display adds only data attributes; original Close/Auto-Close path and band subscription remain intact", () => {
  const display = read("./footswitch-smart-paging-display.tsx"), live = read("./live-smart-lyrics.tsx"), band = read("./band-live-page.tsx");
  assert.match(display, /data-lyric-section=/); assert.match(display, /\{line\.text\}/);
  assert.doesNotMatch(display, /scrollTo|preventDefault|lyric-sync-client/);
  assert.match(live, /onTrigger=\{close\} onReturn=\{close\}/);
  assert.match(band, /\.channel\(`live-show-state:\$\{show\.id\}`\)/);
  assert.match(band, /isLeaderUnlocked && <LyricSyncControls/);
});

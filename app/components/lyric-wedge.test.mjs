import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const helperSource = readFileSync(new URL("../../lib/lyric-wedge.ts", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("./lyric-wedge.tsx", import.meta.url), "utf8");
function compile(source, modules = {}, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: (name) => modules[name] ?? require(name), ...globals });
  return exports;
}
const helpers = compile(helperSource);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const state = (index, second) => ({ current_song_index: index, updated_at: `2026-10-09T12:00:${String(second).padStart(2, "0")}Z` });
function harness(read) {
  let receive, status, removed = 0;
  const seen = [], connections = [];
  const controller = helpers.followWedgeState({ read, subscribe: (event, connection) => {
    receive = event; status = connection; return () => { removed++; };
  } }, (value) => seen.push(value), (value) => connections.push(value));
  return { controller, seen, connections, receive: (value) => receive(value), status: (value) => status(value), removed: () => removed };
}

test("initial and mid-show snapshots select the current setlist entry; repeated library songs remain distinct", async () => {
  const entries = [{ id: "second-use", library: "same", section: "set2", position: 1, created_at: "b" },
    { id: "first-use", library: "same", section: "set1", position: 1, created_at: "a" }];
  const sorted = helpers.sortWedgeEntries(entries);
  const h = harness(async () => state(1, 1));
  await tick();
  assert.equal(helpers.selectedWedgeEntry(sorted, h.seen.at(-1)).id, "second-use");
  h.receive(state(0, 2));
  assert.equal(helpers.selectedWedgeEntry(sorted, h.seen.at(-1)).id, "first-use");
  assert.equal(helpers.selectedWedgeEntry(sorted, null), null);
  assert.equal(helpers.selectedWedgeEntry([], state(0, 1)), null);
  h.controller.destroy();
  assert.equal(h.removed(), 1);
});

test("realtime updates beat outstanding reads and older events; teardown ignores pending work", async () => {
  let resolve;
  const h = harness(() => new Promise((done) => { resolve = done; }));
  h.receive(state(3, 3));
  resolve(state(0, 1));
  await tick();
  h.receive(state(1, 2));
  assert.equal(h.seen.length, 1);
  assert.equal(h.seen[0].current_song_index, 3);
  const pending = h.controller.reconcile();
  h.controller.destroy();
  resolve(state(4, 4));
  await pending;
  h.receive(state(5, 5));
  assert.equal(h.seen.length, 1);
});

test("disconnect retains lyrics; resubscription rereads server state without duplicate subscriptions", async () => {
  let current = state(0, 1);
  const h = harness(async () => current);
  await tick();
  h.status("CHANNEL_ERROR");
  assert.equal(h.connections.at(-1), "disconnected");
  assert.equal(h.seen.at(-1).current_song_index, 0);
  current = state(4, 4);
  h.status("SUBSCRIBED");
  await tick();
  assert.equal(h.connections.at(-1), "connected");
  assert.equal(h.seen.at(-1).current_song_index, 4);
  h.controller.destroy();
  assert.equal(h.removed(), 1);
});

test("failed reads preserve the last song; later reconciliation recovers", async () => {
  let fail = false;
  const h = harness(async () => { if (fail) throw Error("offline"); return state(2, 2); });
  await tick();
  fail = true;
  await h.controller.reconcile();
  assert.equal(h.connections.at(-1), "disconnected");
  assert.equal(h.seen.length, 1);
  fail = false;
  h.status("SUBSCRIBED");
  await tick();
  assert.equal(h.seen.at(-1).current_song_index, 2);
  h.controller.destroy();
});

function nodes(value, result = []) {
  if (Array.isArray(value)) value.forEach((item) => nodes(item, result));
  else if (value?.props) { result.push(value); nodes(value.props.children, result); }
  return result;
}
test("render preserves exact lyric text, shows title/key, clears missing lyrics, and resets only on entry identity change", () => {
  const effects = [], scrolls = [];
  const { WedgeLyrics } = compile(componentSource, {
    react: { useEffect: (fn, deps) => effects.push({ fn, deps }) },
    "@/lib/supabase/client": {}, "@/lib/song-resolvers": {},
    "@/lib/lyric-wedge": helpers, "./footswitch-fullscreen": {},
  }, { window: { scrollTo: (options) => scrolls.push(options) } });
  const lyrics = "VERSE\r\n  [G] Original, / words\r\n\r\nCHORUS\nAgain";
  let view = nodes(WedgeLyrics({ song: { id: "entry-a", title: "Song", key: "G", lyrics } }));
  assert.equal(view.find((node) => node.props["aria-label"] === "Song lyrics").props.children, lyrics);
  assert.equal(view.find((node) => node.type === "h1").props.children, "Song");
  effects[0].fn();
  assert.equal(scrolls[0].top, 0);
  assert.equal(scrolls[0].behavior, "instant");
  view = nodes(WedgeLyrics({ song: { id: "entry-b", title: "No lyric song", key: null, lyrics: "  " } }));
  assert.ok(view.some((node) => node.props.children === "No lyrics available for this song."));
  assert.equal(view.some((node) => node.props["aria-label"] === "Song lyrics"), false);
  assert.equal(effects[1].deps[0], "entry-b");
});

test("wedge uses read-only queries and disabled future mode, with no leader/pedal/calibration integration", () => {
  assert.doesNotMatch(componentSource, /\.(upsert|insert|update|delete|send)\s*\(/);
  assert.doesNotMatch(componentSource, /BandLivePage|ensureLiveShowStateRow|broadcast|keydown|preventDefault|observeReturnTrigger|DiagnosticSettings/);
  assert.match(componentSource, /disabled[^>]*className="mr-2".*Follow the Leader — Coming Soon/);
  assert.match(componentSource, /event: "\*".*table: "live_show_state".*show_id=eq/);
  assert.match(componentSource, /removeChannel/);
});

test("route controller reads the show's joined songs, subscribes once, follows updates and cleans up", async () => {
  const effects = [], values = [], calls = [];
  let payload, channelStatus, removed = 0;
  const channel = { on: (_kind, filter, fn) => {
    assert.equal(filter.filter, "show_id=eq.show-uuid"); payload = fn; return channel;
  }, subscribe: (fn) => { channelStatus = fn; return channel; } };
  const rows = [
    { id: "entry-2", section: "set2", position: 1, created_at: "b", library_song: { title: "Library", key: "G", lyrics: "Original\n\nLyrics" } },
    { id: "entry-1", section: "set1", position: 1, created_at: "a", guest_song: { title: "Guest", key: "D", lyrics: null } },
  ];
  const client = {
    from: (table) => ({ select: (columns) => {
      calls.push({ table, columns });
      const result = { data: table === "shows" ? { id: "show-uuid", name: "Test show" } : table === "setlist_entries" ? rows : state(1, 1), error: null };
      return { eq: () => ({ maybeSingle: async () => result, then: (resolve) => Promise.resolve(result).then(resolve) }) };
    } }),
    channel: () => channel, removeChannel: async () => { removed++; },
  };
  const resolvers = compile(readFileSync(new URL("../../lib/song-resolvers.ts", import.meta.url), "utf8"));
  const doc = new EventTarget(), page = new EventTarget();
  doc.visibilityState = "visible";
  const { LyricWedge } = compile(componentSource, {
    react: { useEffect: (fn, deps) => effects.push({ fn, deps }), useRef: () => ({ current: null }),
      useState: (initial) => { const index = values.length; values.push(initial); return [initial, (value) => { values[index] = value; }]; } },
    "@/lib/supabase/client": { createClient: () => client }, "@/lib/song-resolvers": resolvers,
    "@/lib/lyric-wedge": helpers, "./footswitch-fullscreen": { useDiagnosticFullscreen: () => ({ status: { active: false, label: "Unavailable", message: "Normal" } }) },
  }, { window: page, document: doc, navigator: { onLine: true } });
  LyricWedge({ showSlug: "test-show" });
  const cleanup = effects.find((effect) => effect.deps[0] === "test-show").fn();
  await tick();
  assert.equal(values[0][0].id, "entry-1");
  assert.equal(values[0][1].lyrics, "Original\n\nLyrics");
  assert.equal(values[1].current_song_index, 1);
  payload({ eventType: "UPDATE", new: state(0, 2) });
  assert.equal(values[1].current_song_index, 0);
  channelStatus("SUBSCRIBED"); await tick();
  assert.equal(values[1].current_song_index, 0, "Older reread cannot overwrite newer event");
  assert.ok(calls.every((call) => ["shows", "setlist_entries", "live_show_state"].includes(call.table)));
  cleanup();
  assert.equal(removed, 1);
});

test("wake lock reacquires on visibility restoration and releases on teardown", async () => {
  const doc = new EventTarget();
  doc.visibilityState = "visible";
  let requests = 0, releases = 0, sentinel;
  const nav = { wakeLock: { request: async () => {
    requests++; sentinel = new EventTarget();
    sentinel.release = async () => { releases++; sentinel.dispatchEvent(new Event("release")); };
    return sentinel;
  } } };
  const messages = [];
  const wake = helpers.createWedgeWakeLock(doc, nav, (message) => messages.push(message));
  wake.enable(); await tick();
  assert.equal(requests, 1);
  doc.visibilityState = "hidden";
  await sentinel.release();
  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange")); await tick();
  assert.equal(requests, 2);
  assert.equal(messages.at(-1), "Screen kept awake");
  wake.destroy(); await tick();
  assert.equal(releases, 2);
  doc.dispatchEvent(new Event("visibilitychange")); await tick();
  assert.equal(requests, 2);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
function compile(source, modules = {}, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: (name) => modules[name] ?? require(name), ...globals });
  return exports;
}
const profiles = compile(read("./footswitch-diagnostic-settings.ts"));
const storageApi = compile(read("./lyric-wedge-settings.ts"), { "./footswitch-diagnostic-settings": profiles });
const wedgeHelpers = compile(read("../../lib/lyric-wedge.ts"));
const paging = compile(read("./footswitch-lyric-paging.ts"));

function hooks() {
  let index = 0;
  const slots = [], pending = [];
  const changed = (slot, deps) => !slot || deps.some((value, i) => value !== slot.deps[i]);
  const react = {
    useState(initial) {
      const i = index++;
      if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, (next) => { slots[i].value = typeof next === "function" ? next(slots[i].value) : next; }];
    },
    useMemo(fn, deps) { const i = index++; if (changed(slots[i], deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = index++;
      if (changed(slots[i], deps)) { const previous = slots[i]; slots[i] = { deps }; pending.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); }
    },
  };
  return { react, render(fn) { index = 0; const view = fn(); pending.splice(0).forEach((effect) => effect()); return view; },
    destroy() { slots.forEach((slot) => slot?.cleanup?.()); } };
}
function nodes(value, result = []) {
  if (Array.isArray(value)) value.forEach((item) => nodes(item, result));
  else if (value?.props) { result.push(value); nodes(value.props.children, result); }
  return result;
}
function harness() {
  const runtime = hooks(), scrolls = [];
  const prefs = { settings: storageApi.parseWedgeSettings(null), loaded: true, orientation: "portrait", storageUnavailable: false };
  prefs.setSettings = (fn) => { prefs.settings = fn(prefs.settings); };
  const { LyricWedgePaging } = compile(read("./lyric-wedge-paging.tsx"), {
    react: runtime.react, "react-dom": { flushSync: (fn) => fn() }, "@/lib/lyric-wedge": wedgeHelpers,
    "./lyric-wedge-settings": { useWedgeSettings: () => prefs }, "./footswitch-diagnostic-settings": profiles,
    "./footswitch-lyric-paging": paging, "./footswitch-document-snap": { applyDocumentSnap: (_doc, mode) => { assert.equal(mode, "off"); return () => {}; } },
    "./footswitch-smart-paging-display": { SmartLyricPagingDisplay: function Display() {} },
    "./footswitch-smart-paging-test": { SmartLyricPagingSetup: function Setup() {} },
  }, { document: {}, window: { scrollTo: (options) => scrolls.push(options) } });
  const props = { song: { id: "entry-a", title: "Original Title", key: "G", lyrics: "VERSE\r\n  [G] Exact, / words\r\n\r\nCHORUS\nAgain" },
    setupControls: "SETUP CONTROLS", fullscreen: false, connection: "connected" };
  const render = () => runtime.render(() => LyricWedgePaging(props));
  const display = (view) => nodes(view).find((node) => node.type.name === "Display");
  const measurement = (view) => ({ config: display(view).props.config, pageCount: 2, timestamp: "now", layout: {}, alignment: {} });
  return { render, props, prefs, scrolls, display, measurement };
}

test("shared paginated display receives original song and metadata without setup content or an auto-close wrapper", () => {
  const h = harness(), view = h.render(), display = h.display(view);
  assert.equal(display.props.lyricText, h.props.song.lyrics);
  assert.equal(display.props.config.title, h.props.song.title);
  assert.equal(display.props.config.songKey, "G");
  assert.equal(display.key, "entry-a");
  assert.equal(display.props.config.preferredSize, 56);
  assert.equal(display.props.onTrigger, undefined);
  assert.equal(nodes(view).some((node) => node.props.children === "SETUP CONTROLS"), false);
  assert.equal(h.scrolls.length, 0, "Wait for actual measured page readiness");
});

test("scroll resets once after measured pages, never on scroll samples, same-entry reconnects, or viewport/profile changes", () => {
  const h = harness();
  let view = h.render(), report = h.display(view).props.onMeasurement;
  report({ ...h.measurement(view), pageCount: 0 });
  report({ ...h.measurement(view), config: { songId: "stale-entry" } });
  assert.equal(h.scrolls.length, 0);
  report(h.measurement(view)); report(h.measurement(view));
  assert.equal(h.scrolls.length, 1);
  assert.equal(h.scrolls[0].top, 0);
  assert.equal(h.scrolls[0].behavior, "instant");
  h.props.song = { ...h.props.song };
  h.props.fullscreen = true; h.prefs.orientation = "landscape";
  view = h.render(); h.display(view).props.onMeasurement(h.measurement(view));
  assert.equal(h.scrolls.length, 1);
  h.props.song = { ...h.props.song, id: "entry-b" };
  view = h.render();
  assert.equal(h.display(view).key, "entry-b", "Fresh component drops all old page layout");
  h.display(view).props.onMeasurement(h.measurement(view));
  assert.equal(h.scrolls.length, 2, "Repeated library song with distinct setlist entry resets");
});

test("Close/Calibrate show setup; resume keeps wedge active and selected song; hidden song changes reset on readiness", () => {
  const h = harness();
  let view = h.render(); h.display(view).props.onMeasurement(h.measurement(view));
  h.display(view).props.onReturn(); view = h.render();
  assert.equal(h.scrolls.length, 2, "Manual Close opens setup at its beginning");
  assert.equal(view.type.name, "Setup");
  assert.equal(h.display(view), undefined);
  assert.equal(view.props.sourceControls, "SETUP CONTROLS");
  assert.equal(view.props.startLabel, "OPEN WEDGE LYRICS");
  h.props.song = { ...h.props.song, id: "entry-b" }; h.render();
  h.props.song = { ...h.props.song, id: "entry-a" }; view = h.render();
  view.props.onStart(); view = h.render();
  h.display(view).props.onMeasurement(h.measurement(view));
  assert.equal(h.scrolls.length, 3, "A → B → A while in setup remains a real entry change");
  h.display(view).props.onCalibrate(); view = h.render();
  view.props.onReturn(); view = h.render();
  assert.equal(h.display(view).props.config.songId, "entry-a");
});

test("four profile selection and active-only reset reuse existing calibration utilities", () => {
  const h = harness();
  h.prefs.settings = storageApi.parseWedgeSettings(JSON.stringify({ portraitCalibration: -30, landscapeCalibration: 20,
    fullscreenPortraitCalibration: -175, fullscreenLandscapeCalibration: 45 }));
  for (const [orientation, fullscreen, expected] of [["portrait", false, -30], ["landscape", false, 20], ["portrait", true, -175], ["landscape", true, 45]]) {
    h.prefs.orientation = orientation; h.props.fullscreen = fullscreen;
    assert.equal(h.display(h.render()).props.config.calibration, expected);
  }
  let view = h.render(); h.display(view).props.onCalibrate(); view = h.render();
  view.props.onReset();
  assert.equal(h.prefs.settings.fullscreenLandscapeCalibration, 0);
  assert.equal(h.prefs.settings.fullscreenPortraitCalibration, -175);
  assert.equal(h.prefs.settings.portraitCalibration, -30);
  assert.equal(h.prefs.settings.landscapeCalibration, 20);
  view = h.render(); view.props.onConfig({ ...view.props.config, calibration: 80, preferredSize: 48 });
  assert.equal(h.prefs.settings.fullscreenLandscapeCalibration, 80);
  assert.equal(h.prefs.settings.preferredSize, 48);
});

test("missing lyrics replace paginated content immediately and reset once", () => {
  const h = harness(); let view = h.render();
  h.display(view).props.onMeasurement(h.measurement(view));
  h.props.song = { id: "missing", title: "Missing song", key: "D", lyrics: "  " };
  view = h.render();
  assert.equal(h.display(view), undefined);
  assert.ok(nodes(view).some((node) => node.props.children === "No lyrics available for this song."));
  assert.ok(nodes(view).some((node) => node.type === "h1" && node.props.children === "Missing song"));
  h.render(); assert.equal(h.scrolls.length, 2);
});

test("wedge persistence never reads/copies/writes diagnostic settings; exact four profiles survive refresh", () => {
  const calls = [], data = new Map([["stageflow.footswitchDiagnostic.settings.v1", "LEADER SETTINGS"]]);
  const storage = { getItem: (key) => { calls.push(key); return data.get(key) ?? null; }, setItem: (key, value) => { calls.push(key); data.set(key, value); } };
  const fresh = storageApi.readWedgeSettings(storage);
  assert.equal(fresh.fullscreenPortraitCalibration, -100, "Independent default, not copied -175");
  const prefs = { ...fresh, portraitCalibration: -50, landscapeCalibration: 15, fullscreenPortraitCalibration: -175, fullscreenLandscapeCalibration: 75 };
  storageApi.writeWedgeSettings(storage, prefs);
  const reread = storageApi.readWedgeSettings(storage);
  for (const key of ["portraitCalibration", "landscapeCalibration", "fullscreenPortraitCalibration", "fullscreenLandscapeCalibration"]) assert.equal(reread[key], prefs[key]);
  assert.equal(data.get("stageflow.footswitchDiagnostic.settings.v1"), "LEADER SETTINGS");
  assert.ok(calls.every((key) => key === "stageflow.lyricWedge.settings.v1"));
  const invalid = storageApi.parseWedgeSettings(JSON.stringify({ portraitCalibration: 301, landscapeCalibration: 3, fullscreenPortraitCalibration: -300, fullscreenLandscapeCalibration: 300, footswitchReturnToSetlist: true }));
  assert.equal(invalid.portraitCalibration, -100); assert.equal(invalid.landscapeCalibration, 0);
  assert.equal(invalid.fullscreenPortraitCalibration, -300); assert.equal(invalid.fullscreenLandscapeCalibration, 300);
  assert.equal(invalid.footswitchReturnToSetlist, false);
});

test("settings hydrate before writes and unavailable storage stays session-only", () => {
  for (const unavailable of [false, true]) {
    const runtime = hooks(), written = [];
    const storage = { getItem: (key) => { assert.equal(key, storageApi.WEDGE_SETTINGS_KEY); if (unavailable) throw Error("blocked"); return JSON.stringify({ fullscreenPortraitCalibration: -175 }); },
      setItem: (key, value) => { if (unavailable) throw Error("blocked"); written.push({ key, value }); } };
    const { useWedgeSettings } = compile(read("./lyric-wedge-settings.ts"), { react: runtime.react,
      "./footswitch-diagnostic-settings": { ...profiles, observeDiagnosticOrientation: (_page, report) => { report("landscape"); return () => {}; } },
    }, { window: { localStorage: storage } });
    runtime.render(useWedgeSettings);
    assert.equal(written.length, 0);
    const state = runtime.render(useWedgeSettings);
    assert.equal(state.loaded, true); assert.equal(state.orientation, "landscape");
    assert.equal(state.storageUnavailable, unavailable);
    if (!unavailable) assert.equal(JSON.parse(written[0].value).fullscreenPortraitCalibration, -175);
    runtime.destroy();
  }
});

test("wedge adds no pedal handlers, scroll navigation, return trigger, body lock, shared settings hook or broadcasts", () => {
  const source = read("./lyric-wedge-paging.tsx");
  assert.doesNotMatch(source, /keydown|keyup|preventDefault|scrollBy|scrollIntoView|FootswitchReturnTestDisplay|observeReturnTrigger|overflow-y-auto|overflow.*hidden|useDiagnosticSettings|broadcast/);
  assert.match(source, /applyDocumentSnap\(document, "off", 0\)/);
  assert.match(source, /key=\{song.id\}/);
  assert.doesNotMatch(source, /fullscreen\.(close|request)|\.from\(/);
});

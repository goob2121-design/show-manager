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
    useRef(initial) { const i = index++; if (!slots[i]) slots[i] = { value: { current: initial } }; return slots[i].value; },
    useLayoutEffect(fn, deps) { react.useEffect(fn, deps); },
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
  const controllers = [], sync = { status: "", following: false };
  const prefs = { settings: storageApi.parseWedgeSettings(null), loaded: true, orientation: "portrait", storageUnavailable: false };
  prefs.setSettings = (fn) => { prefs.settings = fn(prefs.settings); };
  const { LyricWedgePaging } = compile(read("./lyric-wedge-paging.tsx"), {
    react: runtime.react, "react-dom": { flushSync: (fn) => fn() }, "@/lib/lyric-wedge": wedgeHelpers,
    "./lyric-wedge-settings": { ...storageApi, useWedgeSettings: () => prefs }, "./footswitch-diagnostic-settings": profiles,
    "./lyric-sync-integration": { useWedgeLyricSync: (_showId, _song, reveal) => { sync.reveal = reveal; return sync; } },
    "./enhanced-footswitch-scrolling": {
      FOOTSWITCH_SCROLL_SPEEDS: [{ label: "Slow", pixelsPerSecond: 100 }, { label: "Medium", pixelsPerSecond: 200 }, { label: "Fast", pixelsPerSecond: 350 }, { label: "Extra Fast", pixelsPerSecond: 500 }],
      createEnhancedFootswitchScrolling: (_page, _doc, options) => {
        const controller = { options, stopped: 0, destroyed: 0, stop() { this.stopped++; }, destroy() { this.destroyed++; } };
        controllers.push(controller); return controller;
      },
    },
    "./footswitch-lyric-paging": paging, "./footswitch-document-snap": { applyDocumentSnap: (_doc, mode) => { assert.equal(mode, "off"); return () => {}; } },
    "./footswitch-smart-paging-display": { SmartLyricPagingDisplay: function Display() {} },
    "./wedge-rotated-lyrics": { WedgeRotatedLyrics: function RotatedDisplay() {} },
    "./footswitch-smart-paging-test": { SmartLyricPagingSetup: function Setup() {} },
  }, { document: {}, window: { scrollTo: (options) => scrolls.push(options) } });
  const props = { song: { id: "entry-a", title: "Original Title", key: "G", lyrics: "VERSE\r\n  [G] Exact, / words\r\n\r\nCHORUS\nAgain" },
    setupControls: "SETUP CONTROLS", fullscreen: false, connection: "connected" };
  const render = () => runtime.render(() => LyricWedgePaging(props));
  const display = (view) => nodes(view).find((node) => node.type.name === "Display");
  const measurement = (view) => ({ config: display(view).props.config, pageCount: 2, timestamp: "now", layout: {}, alignment: {} });
  return { render, props, prefs, scrolls, display, measurement, controllers, sync, destroy: runtime.destroy };
}

test("enhanced wedge scrolling defaults off and setup controls preserve typography and local profiles", () => {
  const h = harness(); let view = h.render();
  assert.equal(h.controllers.length, 0);
  h.display(view).props.onCalibrate(); view = h.render();
  const controls = () => nodes(h.render().props.experimentControls);
  controls().find(node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } });
  controls().find(node => node.props["aria-label"] === "Footswitch Scroll Speed").props.onChange({ target: { value: "350" } });
  controls().find(node => node.type === "input" && node.props.type === "range").props.onChange({ target: { value: "240" } });
  assert.equal(h.controllers.length, 0, "Setup never intercepts keyboard input");
  assert.equal(h.prefs.settings.preferredSize, 56);
  assert.equal(h.prefs.settings.portraitCalibration, -100);
  h.render().props.onStart(); h.render();
  assert.deepEqual({ ...h.controllers[0].options }, { enabled: true, speed: 350, inactivityMs: 240 });
  h.destroy(); assert.equal(h.controllers[0].destroyed, 1);
});

test("positional following cancels Enhanced input while song following and independent scrolling remain available", () => {
  const h = harness(); h.prefs.settings.enhancedFootswitchScrolling = true;
  let view = h.render(); assert.equal(h.controllers.length, 1);
  h.props.song = { ...h.props.song, id: "leader-next-song" };
  view = h.render();
  assert.equal(h.controllers[0].destroyed, 1);
  assert.equal(h.controllers.length, 2);
  assert.equal(h.display(view).props.config.songId, "leader-next-song");
  h.sync.following = true; h.sync.status = "connected";
  view = h.render();
  assert.equal(h.controllers[1].destroyed, 1);
  assert.equal(h.controllers.length, 2);
  assert.ok(nodes(view).some(node => node.props.children?.includes?.("Enhanced scrolling paused")));
  assert.equal(h.prefs.settings.enhancedFootswitchScrolling, true, "Temporary pause never changes the preference");
  h.sync.following = false; h.render();
  assert.equal(h.controllers.length, 3);
  h.destroy();
});

test("controller cleanup covers setup, missing lyrics, loading, fullscreen changes and disabling the experiment", () => {
  for (const interrupt of [h => { h.props.fullscreen = true; }, h => { h.props.song = { ...h.props.song, lyrics: null }; },
    h => { h.prefs.loaded = false; }, h => { h.props.status = "Loading"; }, h => { h.prefs.settings.enhancedFootswitchScrolling = false; }]) {
    const h = harness(); h.prefs.settings.enhancedFootswitchScrolling = true; h.render();
    interrupt(h); h.render(); assert.equal(h.controllers[0].destroyed, 1);
    h.destroy();
  }
  const h = harness(); h.prefs.settings.enhancedFootswitchScrolling = true;
  h.display(h.render()).props.onCalibrate();
  assert.equal(h.controllers[0].stopped, 1, "Stop before navigating to setup");
  h.render(); assert.equal(h.controllers[0].destroyed, 1);
  h.sync.reveal(); h.render(); assert.equal(h.controllers.length, 2, "Existing automatic reveal still opens the wedge");
  h.destroy(); assert.equal(h.controllers[1].destroyed, 1);
});

test("enhanced wedge preferences round-trip under the wedge key without affecting main Smart Lyrics", () => {
  const values = new Map([[profiles.FOOTSWITCH_SETTINGS_KEY, "main-preferences"]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const preferences = { ...storageApi.readWedgeSettings(storage), enhancedFootswitchScrolling: true,
    footswitchScrollSpeed: 500, footswitchInactivityMs: 300, fullscreenPortraitCalibration: -175 };
  storageApi.writeWedgeSettings(storage, preferences);
  assert.deepEqual({ ...storageApi.readWedgeSettings(storage) }, preferences);
  assert.equal(values.get(profiles.FOOTSWITCH_SETTINGS_KEY), "main-preferences");
});

test("rotation is isolated, persists separately, and Normal restores original rendering and calibration", () => {
  const h = harness();
  assert.equal(h.prefs.settings.rotation, "normal");
  h.prefs.settings.fullscreenPortraitCalibration = -175;
  h.prefs.settings.enhancedFootswitchScrolling = true;
  h.props.fullscreen = true;
  h.display(h.render()).props.onCalibrate();
  let setup = h.render();
  nodes(setup.props.experimentControls).find(node => node.props["aria-label"] === "Wedge Display Rotation").props.onChange({ target: { value: "clockwise" } });
  setup = h.render(); assert.equal(setup.props.config.calibration, 0);
  setup.props.onConfig({ ...setup.props.config, calibration: -50 });
  assert.equal(h.prefs.settings.fullscreenPortraitCalibration, -175);
  h.render().props.onStart();
  let view = h.render(), rotated = nodes(view).find(node => node.type.name === "RotatedDisplay");
  assert.equal(h.display(view), undefined);
  assert.equal(rotated.props.rotation, "clockwise");
  assert.equal(rotated.props.config.calibration, -50);
  h.props.song = { ...h.props.song, id: "next-song" };
  rotated = nodes(h.render()).find(node => node.type.name === "RotatedDisplay");
  assert.equal(rotated.key, "next-song:clockwise");
  rotated.props.onCalibrate(); setup = h.render();
  nodes(setup.props.experimentControls).find(node => node.props["aria-label"] === "Wedge Display Rotation").props.onChange({ target: { value: "counterclockwise" } });
  assert.equal(h.render().props.config.calibration, 0);
  h.prefs.settings = { ...h.prefs.settings, rotation: "normal" };
  setup = h.render(); assert.equal(setup.props.config.calibration, -175);
  setup.props.onStart(); view = h.render();
  assert.ok(h.display(view)); assert.ok(!nodes(view).some(node => node.type.name === "RotatedDisplay"));
  let saved;
  storageApi.writeWedgeSettings({ setItem: (_key, value) => { saved = value; } }, h.prefs.settings);
  assert.equal(storageApi.parseWedgeSettings(saved).rotatedCalibration["clockwise:fullscreen:portrait"], -50);
  assert.equal(storageApi.parseWedgeSettings(saved).fullscreenPortraitCalibration, -175);
  h.destroy();
});

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


test("wedge typography accepts every 4px size, preserves old profiles, and round-trips independently", () => {
  for (let size = 32; size <= 96; size += 4) {
    const original = { preferredSize: size, portraitCalibration: -50, landscapeCalibration: 15,
      fullscreenPortraitCalibration: -175, fullscreenLandscapeCalibration: 75,
      portraitCalibrated: true, fullscreenPortraitCalibrated: true, lineSpacing: 1.8 };
    const parsed = storageApi.parseWedgeSettings(JSON.stringify(original));
    for (const [key, value] of Object.entries(original)) assert.equal(parsed[key], value);
    let stored;
    storageApi.writeWedgeSettings({ setItem: (_key, value) => { stored = value; } }, parsed);
    assert.equal(storageApi.parseWedgeSettings(stored).preferredSize, size);
    assert.equal(storageApi.parseWedgeSettings(stored).lineSpacing, 1.8);
  }
  for (const size of [40, 48, 56]) {
    const parsed = storageApi.parseWedgeSettings(JSON.stringify({ preferredSize: size, fullscreenPortraitCalibration: -175 }));
    assert.equal(parsed.preferredSize, size); assert.equal(parsed.lineSpacing, 1.4);
    assert.equal(parsed.fullscreenPortraitCalibration, -175);
  }
  for (const value of [null, [], "bad", { preferredSize: 100, lineSpacing: 2 }, { preferredSize: 33, lineSpacing: 1.45 },
    { preferredSize: "64", lineSpacing: "1.5" }, { preferredSize: 28, lineSpacing: 1.1 }]) {
    const parsed = storageApi.parseWedgeSettings(JSON.stringify(value));
    assert.equal(parsed.preferredSize, 56); assert.equal(parsed.lineSpacing, 1.4);
  }
  assert.equal(storageApi.parseWedgeSettings("not JSON").lineSpacing, 1.4);
  for (let size = 32; size < 96; size += 4) assert.equal(storageApi.adjustWedgeFont(size, 1), size + 4);
  assert.equal(storageApi.adjustWedgeFont(32, -1), 32); assert.equal(storageApi.adjustWedgeFont(96, 1), 96);
  for (let step = 12; step <= 18; step++) assert.equal(storageApi.parseWedgeSettings(JSON.stringify({ lineSpacing: step / 10 })).lineSpacing, step / 10);
  assert.equal(storageApi.adjustWedgeSpacing(1.2, -1), 1.2); assert.equal(storageApi.adjustWedgeSpacing(1.8, 1), 1.8);
  assert.equal(storageApi.adjustWedgeSpacing(1.4, 1), 1.5);
  assert.equal(profiles.parseDiagnosticSettings(JSON.stringify({ preferredSize: 96 })).preferredSize, 56, "Leader validation remains unchanged");
});

test("wedge setup controls update typography only, preserve calibration and do not reset the current song", () => {
  const h = harness();
  h.prefs.settings = storageApi.parseWedgeSettings(JSON.stringify({ fullscreenPortraitCalibration: -175 }));
  let view = h.render(); h.display(view).props.onMeasurement(h.measurement(view));
  h.display(view).props.onCalibrate();
  const click = (label) => nodes(h.render().props.typographyControls).find(node => node.props["aria-label"] === label).props.onClick();
  click("Increase font size"); click("Increase line spacing");
  view = h.render();
  assert.equal(view.props.config.preferredSize, 60); assert.equal(view.props.config.lineSpacing, 1.5);
  assert.equal(h.prefs.settings.fullscreenPortraitCalibration, -175);
  view.props.onReset(); assert.equal(h.prefs.settings.lineSpacing, 1.5);
  view.props.onStart(); view = h.render();
  assert.equal(h.display(view).props.config.lineSpacing, 1.5);
  assert.equal(h.display(view).props.lyricText, h.props.song.lyrics);
  const count = h.scrolls.length;
  h.display(view).props.onMeasurement(h.measurement(view)); assert.equal(h.scrolls.length, count);
  h.display(view).props.onCalibrate();
  h.prefs.settings = { ...h.prefs.settings, preferredSize: 96, lineSpacing: 1.8 };
  view = h.render();
  for (const label of ["Increase font size", "Increase line spacing"]) assert.equal(nodes(view.props.typographyControls).find(n => n.props["aria-label"] === label).props.disabled, true);
  h.prefs.settings = { ...h.prefs.settings, preferredSize: 32, lineSpacing: 1.2 };
  view = h.render();
  for (const label of ["Decrease font size", "Decrease line spacing"]) assert.equal(nodes(view.props.typographyControls).find(n => n.props["aria-label"] === label).props.disabled, true);
});

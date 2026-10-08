import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("./live-smart-lyrics.tsx", import.meta.url), "utf8");
const live = readFileSync(new URL("./band-live-page.tsx", import.meta.url), "utf8");
function compile(text, modules) {
  const exports = {};
  runInNewContext(ts.transpileModule(text, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText,
    { exports, require: (name) => modules[name] ?? require(name) });
  return exports;
}
function nodes(value, result = []) {
  if (Array.isArray(value)) value.forEach((item) => nodes(item, result));
  else if (value?.props) { result.push(value); nodes(value.props.children, result); }
  return result;
}

test("Live lyrics reuse saved profiles, original songs, fullscreen, calibration, Resume and Close", () => {
  const settingsApi = compile(readFileSync(new URL("./footswitch-diagnostic-settings.ts", import.meta.url), "utf8"), {});
  let settings = settingsApi.parseDiagnosticSettings(JSON.stringify({ preferredSize: 56, portraitCalibration: -90,
    fullscreenPortraitCalibration: -175, fullscreenLandscapeCalibration: 25, source: "stageflow", songId: "diagnostic-selection" }));
  const saved = new Map();
  let orientation = "portrait", loaded = true, closed = false, requests = 0, exits = 0;
  const status = { active: false, label: "Ready", message: "Tap to attempt fullscreen" };
  const states = [], memos = [];
  let index = 0, memoIndex = 0;
  const react = { ...require("react"), useEffect: () => {}, useCallback: (fn) => fn,
    useState: (initial) => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], (next) => { states[i] = typeof next === "function" ? next(states[i]) : next; }]; },
    useMemo: (fn, deps) => { const i = memoIndex++; if (!memos[i] || deps.some((value, j) => value !== memos[i].deps[j])) memos[i] = { value: fn(), deps }; return memos[i].value; } };
  const { LiveSmartLyrics } = compile(source, {
    react, "react-dom": { flushSync: (fn) => fn() },
    "./footswitch-diagnostic-settings": { ...settingsApi, useDiagnosticSettings: () => ({ settings, orientation, loaded, storageUnavailable: false,
      setSettings: (fn) => { settings = fn(settings); settingsApi.writeDiagnosticSettings({ setItem: (key, value) => saved.set(key, value) }, settings); } }) },
    "./footswitch-fullscreen": { useDiagnosticFullscreen: () => ({ status, request: () => { requests++; }, close: () => { assert.equal(closed, true); exits++; } }) },
    "./footswitch-smart-paging-display": { SmartLyricPagingDisplay: function Display() {} },
    "./footswitch-smart-paging-test": { SmartLyricPagingSetup: function Setup() {} },
    "./footswitch-document-snap": { applyDocumentSnap: () => {} },
    "./footswitch-lyric-paging": { splitLyricSections: (lyrics) => lyrics.split(/\n\n/) },
  });
  let song = { id: "live-entry", title: "Long title & special é", lyrics: "VERSE 1\r\n[G] Original!\r\n\r\nCHORUS\r\nAgain" };
  const render = () => { index = memoIndex = 0; return LiveSmartLyrics({ song, onClose: () => { closed = true; } }); };
  let view = render();
  let display = nodes(view).find((node) => node.type.name === "Display");
  assert.equal(display.props.lyricText, song.lyrics);
  assert.equal(display.props.config.title, song.title);
  assert.equal(display.props.config.calibration, -90);
  nodes(view).find((node) => node.type === "button").props.onClick();
  assert.equal(requests, 1, "Fullscreen is requested synchronously from the tap");
  assert.equal(status.active, false, "A request alone never claims entry");
  status.active = true;
  display = nodes(render()).find((node) => node.type.name === "Display");
  assert.equal(display.props.config.calibration, -175);
  assert.equal(display.props.config.preferredSize, 56);
  const config = display.props.config;
  display.props.onMeasurement({ config });
  display = nodes(render()).find((node) => node.type.name === "Display");
  assert.equal(display.props.config, config, "Measurement updates cannot trigger a config/effect render loop");
  display.props.onCalibrate();
  let setup = render();
  assert.equal(setup.type.name, "Setup");
  assert.equal(status.active, true);
  assert.equal(exits, 0);
  assert.equal(setup.props.returnLabel, "Back to Live Mode");
  assert.equal(setup.props.startLabel, "RESUME LYRICS IN FULLSCREEN");
  setup.props.onConfig({ ...setup.props.config, calibration: -300 });
  setup = render();
  assert.equal(setup.props.config.calibration, -300);
  assert.equal(settings.portraitCalibration, -90);
  assert.equal(settings.songId, "diagnostic-selection", "Live song does not overwrite diagnostic selection");
  assert.equal(settingsApi.readDiagnosticSettings({ getItem: (key) => saved.get(key) }).fullscreenPortraitCalibration, -300);
  setup.props.onStart();
  display = nodes(render()).find((node) => node.type.name === "Display");
  assert.equal(display.props.config.calibration, -300);
  assert.equal(display.props.lyricText, song.lyrics);
  orientation = "landscape";
  display = nodes(render()).find((node) => node.type.name === "Display");
  assert.equal(display.props.config.calibration, 25);
  status.active = false;
  display = nodes(render()).find((node) => node.type.name === "Display");
  assert.equal(display.props.config.fullscreen, false);
  song = { id: "next", title: "Next Song", lyrics: "Only one verse" };
  display = nodes(render()).find((node) => node.type.name === "Display");
  assert.equal(display.key, "next");
  assert.equal(display.props.lyricText, "Only one verse");
  song = { ...song, lyrics: null };
  view = render();
  assert.ok(nodes(view).some((node) => node.type === "p" && node.props.children === "No lyrics available for this song."));
  assert.ok(!nodes(view).some((node) => node.type.name === "Display"));
  loaded = false;
  assert.ok(nodes(render()).some((node) => node.props.children === "Loading saved lyric settings…"));
  nodes(view).find((node) => node.type === "button").props.onClick();
  assert.equal(closed, true);
  assert.equal(exits, 1);
});

test("Live integration preserves the legacy modal, disables its timers and lock, and retains native scrolling", () => {
  assert.match(source, /SMART_LYRIC_PAGING_ENABLED: boolean = true/);
  assert.match(live, /return <LiveSmartLyrics song=\{currentSong\}/);
  assert.match(live, /const LyricsAction = SMART_LYRIC_PAGING_ENABLED \? "a" : "button"/);
  assert.match(live, /href=\{SMART_LYRIC_PAGING_ENABLED \? "#smart-lyric-paging-display" : undefined\}/);
  assert.match(live, /const shouldLockScroll = \(!SMART_LYRIC_PAGING_ENABLED && lyricsOpen\) \|\| songIntroOpen/);
  assert.match(live, /if \(!nativeLyricsOpenRef.current\) window.scrollTo/);
  assert.equal((live.match(/if \(SMART_LYRIC_PAGING_ENABLED\) return;/g) ?? []).length, 3, "All three legacy auto-scroll effects are guarded");
  assert.match(live, /stopLyricsAutoScroll\(\);\s*setPendingLyricsAutoStart\(false\);\s*nativeLyricsOpenRef.current = true/);
  assert.match(live, /START AUTO SCROLL/);
  assert.match(live, /lyricsScrollContainerRef/);
  assert.match(source, /SmartLyricPagingDisplay/);
  assert.match(source, /SmartLyricPagingSetup/);
  assert.doesNotMatch(source, /localStorage|setInterval|setTimeout|scrollTo|scrollIntoView|preventDefault|onKeyDown|overflow-y|createClient|paginateLyricSections|calibratedPageHeight/);
});

test("Open Lyrics stops legacy scrolling and commits the viewer without changing performance selection", () => {
  const ast = ts.createSourceFile("band-live-page.tsx", live, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let action;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "openLyricsModal") action = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(action);
  const calls = [], nativeLyricsOpenRef = { current: false };
  const code = ts.transpileModule("exports.open = " + action.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2017 } }).outputText;
  const exports = {};
  const selectedSong = Object.freeze({ id: "selected", title: "Chosen", lyrics: null });
  runInNewContext(code, { exports, SMART_LYRIC_PAGING_ENABLED: true, currentSong: selectedSong, nativeLyricsOpenRef,
    stopLyricsAutoScroll: () => calls.push("stop"), setPendingLyricsAutoStart: (value) => calls.push(["pending", value]),
    flushSync: (fn) => { fn(); calls.push("committed"); }, setSongIntroOpen: (value) => calls.push(["intro", value]), setLyricsOpen: (value) => calls.push(["lyrics", value]) });
  exports.open();
  assert.deepEqual(calls, ["stop", ["pending", false], ["intro", false], ["lyrics", true], "committed"]);
  assert.equal(nativeLyricsOpenRef.current, true);
  assert.equal(selectedSong.id, "selected");
});

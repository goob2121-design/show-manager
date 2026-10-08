import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const sources = Object.fromEntries(["footswitch-smart-paging-test", "footswitch-smart-paging-display", "footswitch-lyric-paging", "footswitch-document-snap", "footswitch-smart-paging-samples", "footswitch-smart-paging-observers", "footswitch-diagnostic-settings", "footswitch-song-source"].map((name) => [name, readFileSync(new URL("./" + name + (name.includes("display") || name === "footswitch-smart-paging-test" ? ".tsx" : ".ts"), import.meta.url), "utf8")]));
function compile(name, react = require("react"), globals = {}) {
  const result = { exports: {} };
  const output = ts.transpileModule(sources[name], { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  runInNewContext(output, { exports: result.exports, require: (dependency) => globals.modules?.[dependency] ?? (dependency === "react" ? react : dependency.startsWith("./footswitch-") ? compile(dependency.slice(2), react, globals) : require(dependency)), ...globals });
  return result.exports;
}
function elements(element, list = []) {
  if (Array.isArray(element)) element.forEach((item) => elements(item, list));
  else if (element?.props) { list.push(element); elements(element.props.children, list); }
  return list;
}
const utility = compile("footswitch-lyric-paging");
const samples = compile("footswitch-smart-paging-samples");

test("setup/display are exclusive; configuration and latest measurements survive the return to Setup", () => {
  const state = [];
  let index = 0;
  const react = { ...require("react"), useEffect: () => {}, useCallback: (fn) => fn, useMemo: (fn) => fn(),
    useState: (initial) => { const slot = index++; if (!(slot in state)) state[slot] = initial; return [state[slot], (value) => { state[slot] = typeof value === "function" ? value(state[slot]) : value; }]; } };
  const settingsModule = compile("footswitch-diagnostic-settings");
  const { SmartLyricPagingTest } = compile("footswitch-smart-paging-test", react, { modules: { "./footswitch-diagnostic-settings": {
    ...settingsModule, useDiagnosticSettings: () => { const [settings, setSettings] = react.useState(settingsModule.defaultDiagnosticSettings()); return { settings, setSettings, orientation: "portrait", loaded: true, storageUnavailable: false }; },
  } } });
  const songs = [{ id: "entry", title: "Actual song", lyrics: "VERSE 1\r\n[G] Original!\r\n\r\nCHORUS\r\nAgain" }, { id: "empty", title: "No text", lyrics: null }];
  const render = () => { index = 0; return SmartLyricPagingTest({ onReturn: () => {}, songs }); };
  let mode = render();
  assert.equal(mode.type.name, "SmartLyricPagingSetup");
  const setup = mode.type(mode.props);
  const nodes = elements(setup);
  const range = nodes.find((node) => node.type === "input");
  assert.deepEqual([range.props.min, range.props.max, range.props.step, range.props.value], [-100, 100, 10, -100]);
  range.props.onChange({ target: { value: "30" } });
  mode = render();
  elements(mode.type(mode.props)).find((node) => node.type === "a" && node.props.href === "#smart-lyric-paging-display").props.onClick();
  mode = render();
  assert.equal(mode.type.name, "SmartLyricPagingDisplay");
  assert.equal(mode.props.config.calibration, 30);
  const measurement = { timestamp: "2026-10-07T12:00:00Z", config: mode.props.config,
    layout: { pageHeight: 892, calculatedHeight: 862, controlsHeight: 44, viewportHeight: 906, documentHeight: 906, viewportChanged: false },
    pageCount: 7, visiblePage: 4, alignment: { index: 3, offset: -15, scrollPosition: 2691, boundary: 2676, error: 15 } };
  mode.props.onMeasurement(measurement);
  mode.props.onReturn();
  mode = render();
  assert.equal(mode.type.name, "SmartLyricPagingSetup");
  assert.equal(mode.props.history.length, 1);
  assert.equal(mode.props.history[0].alignment.error, 15);
  assert.equal(mode.props.config.calibration, 30);
  const html = renderToStaticMarkup(mode.type(mode.props));
  assert.ok(html.includes("Page 4 of 7"));
  assert.ok(html.includes("Recorded Calibration: 30px"));
  assert.ok(html.includes("Full-screen controls: 44px"));
  assert.ok(!html.includes('data-smart-lyric-page'));
  assert.match(sources["footswitch-smart-paging-test"], /slice\(0, 10\)/);
  let selection = elements(mode.props.sourceControls).find((node) => node.type.name === "FootswitchSongSelection");
  selection.props.onSource("stageflow");
  mode = render();
  assert.equal(mode.props.canStart, false);
  selection = elements(mode.props.sourceControls).find((node) => node.type.name === "FootswitchSongSelection");
  selection.props.onSong("empty");
  mode = render();
  assert.equal(mode.props.missingLyrics, true);
  assert.equal(mode.props.canStart, false);
  elements(mode.props.sourceControls).find((node) => node.type.name === "FootswitchSongSelection").props.onSong("entry");
  mode = render();
  assert.equal(mode.props.sectionCount, 2);
  assert.equal(mode.props.canStart, true);
  mode.props.onStart();
  mode = render();
  assert.equal(mode.props.lyricText, songs[0].lyrics, "Original lyric string reaches the existing display unchanged");
  assert.equal(mode.props.config.title, "Actual song");
});

test("clean display has only Back and page controls, no setup footprint, and unclipped document-flow pages", () => {
  const config = { sample: "realistic", preferredSize: 48, calibration: 0 };
  const pages = utility.paginateLyricSections(utility.splitLyricSections(samples.SMART_PAGING_SAMPLES.realistic),
    { preferredFontSize: 48, minimumFontSize: 28, contentHeight: 810, measureLine: (_text, font) => font * 1.4 });
  const layout = { pages, pageHeight: 862, calculatedHeight: 862, controlsHeight: 44, viewportHeight: 906, documentHeight: 906, viewportChanged: false };
  const react = { ...require("react"), useRef: () => ({ current: null }), useEffect: () => {},
    useState: (value) => [value === null ? layout : value, () => {}] };
  const { SmartLyricPagingDisplay } = compile("footswitch-smart-paging-display", react);
  const view = SmartLyricPagingDisplay({ config, onReturn: () => {}, onMeasurement: () => {} });
  const nodes = elements(view);
  const controls = nodes.filter((node) => ["a", "button", "input", "select"].includes(node.type));
  assert.equal(controls.length, 1);
  assert.equal(controls[0].props.children, "Back to Setup");
  assert.equal(controls[0].props.href, "#smart-lyric-paging-setup");
  const pageNodes = nodes.filter((node) => "data-smart-lyric-page" in node.props);
  assert.equal(pageNodes.length, 7);
  assert.ok(pageNodes.every((node) => node.props.style.minHeight === 862 && node.props.style.scrollSnapAlign === "none"));
  assert.ok(pageNodes.every((node) => /box-border/.test(node.props.className) && /m-0/.test(node.props.className)));
  for (const node of nodes.filter((node) => !node.props["aria-hidden"])) {
    assert.doesNotMatch(node.props.className ?? "", /overflow(?:-[xy])?-(auto|hidden|scroll)|snap-|scroll-smooth|touch-none/);
    assert.equal(node.props.style?.height, undefined);
    assert.equal(node.props.onKeyDown, undefined);
  }
  const html = renderToStaticMarkup(view);
  assert.ok(html.includes("Page 1 of 7"));
  for (const forbidden of ["How to Calibrate", "START FULL-SCREEN", "Calibration", "Viewport", "Alignment Error", "Sample"]) assert.ok(!html.includes(forbidden));
  for (const section of utility.splitLyricSections(samples.SMART_PAGING_SAMPLES.realistic)) for (const line of section.split("\n")) assert.ok(html.includes(line));
});

test("display measures its small controls and real page rects; returning removes passive observers", () => {
  const config = { sample: "realistic", preferredSize: 48, calibration: -40 };
  const effects = [], setters = [], records = [];
  const page = Object.assign(new EventTarget(), { innerHeight: 906, scrollY: 15,
    visualViewport: Object.assign(new EventTarget(), { height: 906, offsetTop: 0 }) });
  const controls = { getBoundingClientRect: () => ({ height: 44, bottom: 44 }) };
  const rail = { getBoundingClientRect: () => ({ width: 900 }), querySelectorAll: () => [{ getBoundingClientRect: () => ({ top: 29, bottom: 851 }) }] };
  const probe = { style: {}, textContent: "", getBoundingClientRect: () => ({ height: Math.max(1, Math.ceil(probe.textContent.length / 30)) * parseFloat(probe.style.fontSize) * 1.4 }) };
  const refs = [controls, rail, probe, null];
  let refIndex = 0;
  const layout = { pages: [{ lines: [{ text: "Mock", originalLine: 0, continued: false }], section: 1, part: 1, fontSize: 48, expanded: false }],
    pageHeight: 822, calculatedHeight: 862, controlsHeight: 44, viewportHeight: 906, documentHeight: 906, viewportChanged: false };
  const react = { ...require("react"), useRef: () => ({ current: refs[refIndex++] }), useEffect: (effect) => effects.push(effect),
    useState: (value) => [value === null ? layout : value, (next) => setters.push(next)] };
  const { SmartLyricPagingDisplay } = compile("footswitch-smart-paging-display", react, { window: page, document: { scrollingElement: { clientHeight: 906 } } });
  SmartLyricPagingDisplay({ config, onReturn: () => {}, onMeasurement: (record) => records.push(record) });
  const cleanups = effects.map((effect) => effect());
  assert.equal(setters[0].controlsHeight, 44);
  assert.equal(setters[0].calculatedHeight, 862);
  assert.equal(setters[0].pageHeight, 822);
  assert.equal(records.at(-1).alignment.error, 15);
  assert.equal(records.at(-1).alignment.boundary, 0, "First page is aligned to the visible area, not setup space");
  assert.equal(records.at(-1).visiblePage, 1);
  page.scrollY = 30;
  page.dispatchEvent(new Event("scroll"));
  assert.equal(records.at(-1).alignment.scrollPosition, 30);
  cleanups.forEach((cleanup) => cleanup());
  const count = records.length, setCount = setters.length;
  page.dispatchEvent(new Event("scroll"));
  page.visualViewport.height = 800;
  page.visualViewport.dispatchEvent(new Event("resize"));
  assert.equal(records.length, count);
  assert.equal(setters.length, setCount);
});

test("no keyboard interception, scroll writes, fullscreen API, body lock, or production dependencies", () => {
  for (const name of ["footswitch-smart-paging-test", "footswitch-smart-paging-display"]) {
    const ast = ts.createSourceFile(name + ".tsx", sources[name], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const forbidden = new Set(["preventDefault", "scrollTo", "scrollBy", "scrollIntoView", "requestFullscreen", "setInterval", "setTimeout", "listenForKeyboardInput", "listenForPointerMouseInput", "localStorage", "createClient"]);
    function visit(node) {
      if (ts.isIdentifier(node)) assert.equal(forbidden.has(node.text), false, node.text);
      if (ts.isImportDeclaration(node)) assert.ok(["react", "react-dom"].includes(node.moduleSpecifier.text) || node.moduleSpecifier.text.startsWith("./footswitch-"));
      if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) assert.doesNotMatch(node.left.getText(ast), /scrollTop|scrollLeft|scrollY|scrollX|body/);
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.match(sources["footswitch-smart-paging-test"], /useEffect\(\(\) => applyDocumentSnap\(document, "off", 0\), \[\]\)/);
});

test("read-only show songs and samples preserve original lyrics; search and missing lyrics are safe", () => {
  const { diagnosticSong, searchDiagnosticSongs } = compile("footswitch-song-source");
  const songs = Object.freeze([Object.freeze({ id: "library-entry", title: "Morning Light", lyrics: "  VERSE 1\r\n[C] It's fine!\r\n\r\nCHORUS\r\nAgain\r\n\r\nCHORUS\r\nAgain\r\n" }), Object.freeze({ id: "guest-entry", title: "Guest Song", lyrics: null })]);
  assert.equal(diagnosticSong({ source: "stageflow", songId: "library-entry" }, songs), songs[0]);
  assert.equal(diagnosticSong({ source: "stageflow", songId: "other-show" }, songs), null);
  assert.equal(searchDiagnosticSongs(songs, " MORNING ")[0], songs[0]);
  for (const sample of ["realistic", "overflow"]) assert.equal(diagnosticSong({ source: "sample", sample }, songs).lyrics, samples.SMART_PAGING_SAMPLES[sample]);
  const sections = utility.splitLyricSections(songs[0].lyrics);
  const pages = utility.paginateLyricSections(sections, { preferredFontSize: 56, minimumFontSize: 28, contentHeight: 810, measureLine: (_text, size) => size * 1.4 });
  assert.equal(pages.flatMap((page) => page.lines.map((line) => line.text)).join("\n"), sections.join("\n"));
  assert.equal(sections.length, 3);
  const { SmartLyricPagingSetup } = compile("footswitch-smart-paging-test");
  const html = renderToStaticMarkup(SmartLyricPagingSetup({ config: { sample: "realistic", preferredSize: 56, calibration: -100, source: "stageflow", title: "Guest Song", orientation: "portrait" }, history: [], onConfig: () => {}, onReturn: () => {}, onStart: () => {}, missingLyrics: true, canStart: false }));
  assert.ok(html.includes("No lyrics available for this song."));
  assert.ok(!html.includes('href="#smart-lyric-paging-display"'));
  const parent = readFileSync(new URL("./performance-setup-page.tsx", import.meta.url), "utf8");
  assert.match(parent, /<FootswitchTest songs=\{songs\}/);
  assert.match(parent, /lyrics: resolveSongLyrics\(row\)/);
  assert.match(parent, /\.eq\("show_id", showRow.id\)/);
  assert.doesNotMatch(sources["footswitch-song-source"], /createClient|fetch\(|\.update\(|\.insert\(/);
});

test("orientation changes load independent calibration while settings hydrate before saving and clean up", () => {
  const state = [], effects = [];
  let index = 0;
  const query = Object.assign(new EventTarget(), { matches: false });
  const storage = new Map([["stageflow.footswitchDiagnostic.settings.v1", JSON.stringify({ preferredSize: 48, portraitCalibration: -80, landscapeCalibration: 20, source: "stageflow", songId: "entry" })]]);
  let writes = 0;
  const page = { matchMedia: () => query, localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => { writes++; storage.set(key, value); } } };
  const react = { ...require("react"), useEffect: (fn) => effects.push(fn), useState: (initial) => { const slot = index++; if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial; return [state[slot], (value) => { state[slot] = typeof value === "function" ? value(state[slot]) : value; }]; } };
  const settingsApi = compile("footswitch-diagnostic-settings", react, { window: page });
  const render = () => { index = 0; effects.length = 0; return settingsApi.useDiagnosticSettings(); };
  render();
  const cleanup = effects[0]();
  effects[1]();
  assert.equal(writes, 0, "Initial defaults must not overwrite stored preferences");
  let hook = render();
  assert.equal(hook.settings.preferredSize, 48);
  assert.equal(hook.settings.songId, "entry");
  assert.equal(hook.loaded, true);
  effects[1]();
  query.matches = true;
  query.dispatchEvent(new Event("change"));
  hook = render();
  assert.equal(hook.orientation, "landscape");
  assert.equal(settingsApi.orientationCalibration(hook.settings, hook.orientation), 20);
  hook.setSettings((current) => settingsApi.updateOrientationCalibration(current, "landscape", 40));
  hook = render();
  effects[1]();
  assert.equal(hook.settings.portraitCalibration, -80);
  assert.equal(JSON.parse(storage.get(settingsApi.FOOTSWITCH_SETTINGS_KEY)).landscapeCalibration, 40);
  query.matches = false;
  query.dispatchEvent(new Event("change"));
  hook = render();
  assert.equal(settingsApi.orientationCalibration(hook.settings, hook.orientation), -80);
  cleanup();
  query.matches = true;
  query.dispatchEvent(new Event("change"));
  assert.equal(render().orientation, "portrait");
});

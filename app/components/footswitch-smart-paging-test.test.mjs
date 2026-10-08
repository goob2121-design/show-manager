import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const sources = Object.fromEntries(["footswitch-smart-paging-test", "footswitch-smart-paging-display", "footswitch-lyric-paging", "footswitch-document-snap", "footswitch-smart-paging-samples", "footswitch-smart-paging-observers", "footswitch-diagnostic-settings", "footswitch-song-source", "footswitch-fullscreen"].map((name) => [name, readFileSync(new URL("./" + name + (name.includes("display") || name === "footswitch-smart-paging-test" ? ".tsx" : ".ts"), import.meta.url), "utf8")]));
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
  let diagnosticOrientation = "portrait";
  const fullscreenCalls = [];
  const fullscreenState = { label: "Normal", message: "Not attempted", active: false };
  const { SmartLyricPagingTest } = compile("footswitch-smart-paging-test", react, { modules: { "./footswitch-diagnostic-settings": {
    ...settingsModule, useDiagnosticSettings: () => { const [settings, setSettings] = react.useState(settingsModule.defaultDiagnosticSettings()); return { settings, setSettings, orientation: diagnosticOrientation, loaded: true, storageUnavailable: false }; },
  }, "./footswitch-fullscreen": { useDiagnosticFullscreen: () => ({ status: fullscreenState, request: () => fullscreenCalls.push("request"), close: () => { assert.equal(state[1], false, "Lyrics must unmount before starting browser exit"); fullscreenCalls.push("close"); return Promise.resolve(); } }) } } });
  const songs = [{ id: "entry", title: "Actual song", lyrics: "VERSE 1\r\n[G] Original!\r\n\r\nCHORUS\r\nAgain" }, { id: "empty", title: "No text", lyrics: null }];
  const render = () => { index = 0; return SmartLyricPagingTest({ onReturn: () => {}, songs }); };
  let mode = render();
  assert.equal(mode.type.name, "SmartLyricPagingSetup");
  const setup = mode.type(mode.props);
  const nodes = elements(setup);
  const range = nodes.find((node) => node.type === "input");
  assert.deepEqual([range.props.min, range.props.max, range.props.step, range.props.value], [-300, 300, 5, -100]);
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
  mode.props.onReturn();
  mode = render();
  assert.equal(mode.props.config.songId, "entry");
  assert.equal(mode.props.config.source, "stageflow");
  assert.equal(mode.props.config.preferredSize, 56);
  assert.equal(mode.props.config.calibration, 30);
  const before = fullscreenCalls.filter((call) => call === "request").length;
  elements(mode.props.fullscreenControls).find((node) => node.type === "a").props.onClick();
  assert.equal(fullscreenCalls.filter((call) => call === "request").length, before + 1, "The tap invokes the request immediately");
  mode = render();
  assert.equal(mode.type.name, "SmartLyricPagingDisplay");
  assert.equal(mode.props.fullscreenLabel, "Normal");
  assert.equal(mode.props.config.calibration, 30, "Requested but not entered fullscreen uses regular calibration");
  fullscreenState.active = true;
  fullscreenState.label = "Fullscreen";
  mode = render();
  assert.equal(mode.props.config.calibration, -100);
  mode.props.onCalibrate();
  mode = render();
  assert.equal(mode.type.name, "SmartLyricPagingSetup");
  assert.equal(mode.props.config.fullscreen, true, "Calibrate keeps the document fullscreen");
  assert.notEqual(fullscreenCalls.at(-1), "close", "Calibrate never requests browser exit");
  assert.equal(mode.props.config.songId, "entry");
  assert.equal(mode.props.config.preferredSize, 56);
  assert.ok(renderToStaticMarkup(mode.type(mode.props)).includes("RESUME LYRICS IN FULLSCREEN"));
  assert.ok(renderToStaticMarkup(mode.type(mode.props)).includes("Fullscreen — Portrait"));
  mode.props.onConfig({ ...mode.props.config, calibration: -125 });
  mode = render();
  mode.props.onStart();
  mode = render();
  assert.equal(mode.props.config.calibration, -125);
  for (const calibration of [-300, 300]) {
    mode.props.onCalibrate();
    mode = render();
    mode.props.onConfig({ ...mode.props.config, calibration });
    mode = render();
    mode.props.onStart();
    mode = render();
    assert.equal(mode.props.config.calibration, calibration, "Resume uses latest fullscreen portrait value");
    assert.equal(mode.props.config.preferredSize, 56);
  }
  diagnosticOrientation = "landscape";
  mode = render();
  assert.equal(mode.props.config.calibration, 0);
  mode.props.onCalibrate();
  mode = render();
  mode.props.onConfig({ ...mode.props.config, calibration: -200 });
  mode = render();
  mode.props.onStart();
  mode = render();
  assert.equal(mode.props.config.calibration, -200);
  fullscreenState.active = false;
  mode = render();
  assert.equal(mode.props.config.calibration, 0, "Regular landscape is independent");
  fullscreenState.active = true;
  diagnosticOrientation = "portrait";
  mode = render();
  assert.equal(mode.props.config.calibration, 300);
  mode.props.onReturn();
  assert.equal(fullscreenCalls.at(-1), "close");
  mode = render();
  assert.equal(mode.props.config.songId, "entry");
  assert.equal(mode.type.name, "SmartLyricPagingSetup");
  fullscreenState.active = false;
  fullscreenState.label = "Normal";
  mode = render();
  assert.equal(mode.props.config.calibration, 30, "Exit restores regular portrait without changing it");
  fullscreenState.active = true;
  mode = render();
  assert.equal(mode.type.name, "SmartLyricPagingSetup", "A late fullscreen event cannot reopen lyrics");
  assert.equal(mode.props.config.calibration, 300);
  mode.props.onStart();
  mode = render();
  fullscreenState.active = false;
  mode = render();
  assert.equal(mode.type.name, "SmartLyricPagingDisplay", "An external browser exit may keep normal lyrics open");
  assert.equal(mode.props.config.calibration, 30);
  mode.props.onReturn();
  assert.equal(render().type.name, "SmartLyricPagingSetup");
  for (const label of ["Unavailable", "Declined"]) {
    fullscreenState.label = label;
    mode = render();
    mode.props.onStart();
    mode = render();
    mode.props.onReturn();
    assert.equal(render().type.name, "SmartLyricPagingSetup", `Close works when fullscreen is ${label}`);
  }
});

test("fixed title header is centered, touch-friendly and closes without changing lyric pages or the existing bar footprint", () => {
  const config = { sample: "realistic", preferredSize: 48, calibration: 0, title: "BLUE RIDGE CABIN HOME — a very long song title" };
  const pages = utility.paginateLyricSections(utility.splitLyricSections(samples.SMART_PAGING_SAMPLES.realistic),
    { preferredFontSize: 48, minimumFontSize: 28, contentHeight: 810, measureLine: (_text, font) => font * 1.4 });
  const layout = { pages, pageHeight: 862, calculatedHeight: 862, controlsHeight: 44, viewportHeight: 906, documentHeight: 906, viewportChanged: false };
  const react = { ...require("react"), useRef: () => ({ current: null }), useEffect: () => {},
    useState: (value) => [value === null ? layout : value, () => {}] };
  const { SmartLyricPagingDisplay } = compile("footswitch-smart-paging-display", react);
  let closed = false;
  const view = SmartLyricPagingDisplay({ config, onReturn: () => { closed = true; }, onMeasurement: () => {} });
  const nodes = elements(view);
  const controls = nodes.filter((node) => ["a", "button", "input", "select"].includes(node.type));
  assert.equal(controls.length, 2);
  controls.sort((a) => a.props["aria-label"].startsWith("Close") ? -1 : 1);
  assert.equal(nodes.some((node) => node.type === "aside"), false, "Overlay is hidden by default");
  assert.equal(controls[0].props["aria-label"], "Close lyric test and return to setup");
  assert.equal(controls[0].type, "button");
  assert.equal(controls[0].props.type, "button");
  assert.equal(controls[0].props.href, undefined, "Close does not race fullscreen exit with fragment navigation");
  controls[0].props.onClick();
  assert.equal(closed, true);
  const header = nodes.find((node) => node.type === "header");
  assert.match(header.props.className, /fixed inset-x-0 top-0/);
  assert.match(header.props.className, /grid-cols-\[9rem_minmax\(0,1fr\)_9rem\]/, "Equal outer columns center the title across the screen");
  assert.match(header.props.className, /pointer-events-none/);
  assert.match(header.props.className, /bg-\[#080808\] text-white/);
  assert.equal(header.props.style.height, 44, "The fixed header occupies only the already measured bar height");
  assert.match(header.props.style.paddingInline, /safe-area-inset-left.*safe-area-inset-right/);
  assert.match(controls[0].props.className, /pointer-events-auto/);
  assert.match(controls[0].props.className, /min-h-11/);
  const title = nodes.find((node) => node.type === "h1");
  assert.equal(elements(title).find((node) => node.type === "span").props.children, config.title);
  assert.equal(title.props.title, config.title);
  assert.match(title.props.className, /truncate text-center/);
  assert.equal(title.props.style.fontSize, "clamp(18px, 3.5vw, 26px)");
  assert.equal(title.props.style.lineHeight, "32px");
  const footprint = nodes.find((node) => node.props.ref && node.props["aria-hidden"] && /sticky/.test(node.props.className));
  assert.match(footprint.props.className, /sticky top-0.*border-b.*px-3 py-1/);
  assert.ok(!elements(footprint).some((node) => node.type === "a"), "The footprint has no invisible interactive controls");
  const pageNodes = nodes.filter((node) => "data-smart-lyric-page" in node.props);
  assert.equal(pageNodes.length, 7);
  assert.ok(pageNodes.every((node) => node.props.style.minHeight === 862 && node.props.style.scrollSnapAlign === "none"));
  assert.ok(pageNodes.every((node) => /box-border/.test(node.props.className) && /m-0/.test(node.props.className)));
  for (const node of nodes.filter((node) => !node.props["aria-hidden"])) {
    assert.doesNotMatch(node.props.className ?? "", /overflow(?:-[xy])?-(auto|hidden|scroll)|snap-|scroll-smooth|touch-none/);
    if (node.type !== "header") assert.equal(node.props.style?.height, undefined);
    assert.equal(node.props.onKeyDown, undefined);
  }
  const html = renderToStaticMarkup(view);
  assert.ok(html.includes("Page 1 of 7"));
  for (const forbidden of ["How to Calibrate", "START FULL-SCREEN", "Calibration", "Viewport", "Alignment Error", "Sample"]) assert.ok(!html.includes(forbidden));
  for (const section of utility.splitLyricSections(samples.SMART_PAGING_SAMPLES.realistic)) for (const line of section.split("\n")) assert.ok(html.includes(line));
  let calibrated = false;
  const fullscreenView = SmartLyricPagingDisplay({ config: { ...config, fullscreen: true }, onReturn: () => {}, onMeasurement: () => {}, onCalibrate: () => { calibrated = true; } });
  const calibration = elements(fullscreenView).find((node) => node.props["aria-label"] === "Open calibration setup while staying fullscreen");
  assert.ok(calibration);
  assert.ok(elements(calibration).some((node) => node.type === "span" && node.props.children === "Calibrate"));
  assert.match(calibration.props.className, /min-h-11 min-w-11/);
  assert.match(calibration.props.className, /pointer-events-auto/);
  assert.match(calibration.props.className, /border-white.*text-white/);
  const gutter = elements(fullscreenView).find((node) => node.type === "div" && node.props.children === calibration);
  assert.match(gutter.props.className, /pl-16/, "64px clearance from Safari fullscreen corner");
  const normalView = SmartLyricPagingDisplay({ config, onReturn: () => {}, onMeasurement: () => {}, onCalibrate: () => {} });
  assert.ok(elements(normalView).find((node) => node.props["aria-label"] === "Open calibration setup"), "Calibration stays accessible after browser exits fullscreen");
  calibration.props.onClick();
  assert.equal(calibrated, true);
  assert.equal(elements(fullscreenView).find((node) => node.type === "header").props.style.height, header.props.style.height);
  assert.equal(elements(fullscreenView).filter((node) => "data-smart-lyric-page" in node.props).length, 7);
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

test("selector distinguishes loading, load failure, successful empty library, and no search matches", () => {
  const render = (props, query = "") => {
    const react = { ...require("react"), useState: () => [query, () => {}] };
    const { FootswitchSongSelection } = compile("footswitch-smart-paging-test", react);
    return renderToStaticMarkup(FootswitchSongSelection({ source: "stageflow", songId: "", songs: [], onSource: () => {}, onSong: () => {}, ...props }));
  };
  assert.ok(render({ songStatus: "Loading StageFlow song library…" }).includes("Loading StageFlow song library"));
  const failed = render({ songStatus: "Could not load StageFlow song library: denied", onRetry: () => {} });
  assert.ok(failed.includes("Retry loading songs"));
  assert.ok(!failed.includes("loaded successfully"));
  assert.ok(render({}).includes("loaded successfully, but no songs are available to this session"));
  assert.ok(render({ songs: [{ id: "library:1", title: "Available song", lyrics: null }] }, "unmatched").includes("No songs match your search."));
  const source = compile("footswitch-song-source");
  assert.equal(source.diagnosticSong({ source: "stageflow", songId: "old-entry" }, [{ id: "library:1", title: "Linked song", lyrics: "original", aliases: ["old-entry"] }]).id, "library:1");
});


test("runtime overlay reports measured rects and calibrated CSS at both fullscreen extremes", () => {
  const heights = [];
  for (const calibration of [-300, 300]) {
    const effects = [], state = [];
    let slot = 0, refSlot = 0;
    const root = {};
    const page = Object.assign(new EventTarget(), { innerHeight: 906, scrollY: 23,
      visualViewport: Object.assign(new EventTarget(), { height: 906, offsetTop: 0 }),
      matchMedia: () => ({ matches: false }), getComputedStyle: () => ({ fontSize: "56px", minHeight: state[0].pageHeight + "px" }) });
    const controls = { getBoundingClientRect: () => ({ height: 44, bottom: 44 }) };
    const rail = { getBoundingClientRect: () => ({ width: 900 }), querySelectorAll: () => [{ getBoundingClientRect: () => ({ top: 44, bottom: 44 + state[0].pageHeight, height: state[0].pageHeight }) }] };
    const probe = { style: {}, textContent: "", getBoundingClientRect: () => ({ height: parseFloat(probe.style.fontSize) * 1.4 }) };
    const refs = [controls, rail, probe, null].map((current) => ({ current }));
    const react = { ...require("react"), useRef: () => refs[refSlot++], useEffect: (fn) => effects.push(fn),
      useState: (initial) => { const i = slot++; if (!(i in state)) state[i] = initial; return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; } };
    const { SmartLyricPagingDisplay } = compile("footswitch-smart-paging-display", react, { window: page, document: { documentElement: root, fullscreenElement: root, scrollingElement: { clientHeight: 906 } } });
    const render = () => { slot = refSlot = 0; effects.length = 0; return SmartLyricPagingDisplay({ config: { sample: "realistic", preferredSize: 56, calibration, fullscreen: true }, lyricText: "VERSE 1\nOriginal lyrics", onReturn: () => {}, onMeasurement: () => {} }); };
    render();
    const cleanLayout = effects[0]();
    let view = render();
    const cleanPosition = effects[1]();
    elements(view).find((node) => node.props["aria-label"] === "Toggle lyric calibration diagnostics").props.onClick();
    view = render();
    const overlay = elements(view).find((node) => node.type === "aside");
    assert.match(overlay.props.className, /fixed/);
    assert.match(overlay.props.className, /pointer-events-none/);
    const html = renderToStaticMarkup(overlay);
    assert.ok(html.includes("Fullscreen"));
    assert.ok(html.includes("Portrait"));
    assert.ok(html.includes("Maximum"));
    assert.ok(html.includes("56px"));
    assert.ok(html.includes(calibration + "px"));
    assert.ok(html.includes(state[0].pageHeight.toFixed(1) + "px"));
    assert.equal(state[3].renderedHeight, state[0].pageHeight, "Reads the supplied DOM rectangle");
    assert.equal(state[3].appliedCalibration, calibration);
    assert.equal(state[3].scrollY, 23);
    const section = elements(view).find((node) => "data-smart-lyric-page" in node.props);
    assert.equal(section.props.style.minHeight, 862 + calibration);
    assert.equal(section.props.style.fontSize, 56);
    heights.push(section.props.style.minHeight);
    cleanPosition(); cleanLayout();
  }
  assert.equal(heights[1] - heights[0], 600, "Calibration changes rendered min-height by 600px; real Safari rects require device testing");
});

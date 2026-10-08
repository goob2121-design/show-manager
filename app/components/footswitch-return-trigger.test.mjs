import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const helperSource = readFileSync(new URL("./footswitch-return-trigger.ts", import.meta.url), "utf8");
function compile(source, globals = {}, modules = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText,
    { exports, require: (name) => modules[name] ?? require(name), ...globals });
  return exports;
}
function fixture() {
  const tasks = new Map(), records = [], registrations = [];
  let taskId = 0, finalBottom = 2800, zoneStart = 2920, resize;
  const page = Object.assign(new EventTarget(), { scrollY: 0, innerHeight: 1000, innerWidth: 800,
    visualViewport: Object.assign(new EventTarget(), { height: 1000, offsetTop: 0 }),
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} disconnect() { resize = null; } } });
  const add = page.addEventListener.bind(page);
  page.addEventListener = (type, fn, options) => { registrations.push({ type, options }); add(type, fn, options); };
  const root = {};
  const final = { getBoundingClientRect: () => ({ top: finalBottom - 800 - page.scrollY, bottom: finalBottom - page.scrollY }) };
  const zone = { getBoundingClientRect: () => ({ top: zoneStart - page.scrollY, bottom: zoneStart + 1000 - page.scrollY }) };
  const doc = Object.assign(new EventTarget(), { fullscreenElement: null, documentElement: root,
    querySelector: (selector) => selector.includes("data-smart-lyric-page") ? final : selector.includes("header") ? { getBoundingClientRect: () => ({ bottom: 44 }) } : root });
  const { observeReturnTrigger } = compile(helperSource, { setTimeout: (fn) => { tasks.set(++taskId, fn); return taskId; }, clearTimeout: (id) => tasks.delete(id) });
  const cleanup = observeReturnTrigger(page, doc, zone, (snapshot) => records.push(snapshot));
  return { page, doc, root, records, tasks, registrations, cleanup, last: () => records.at(-1),
    scroll: (y) => { page.scrollY = y; page.dispatchEvent(new Event("scroll")); },
    settle: () => { const pending = [...tasks.values()]; tasks.clear(); pending.forEach((fn) => fn()); },
    reflow: () => { finalBottom += 200; zoneStart += 200; resize(); } };
}

test("initialization and first appearance of final verse never trigger; later movement without a pause also cannot trigger", () => {
  const f = fixture();
  assert.equal(f.last().triggered, false);
  assert.equal(f.last().finalReached, false);
  assert.equal(f.tasks.size, 0);
  f.scroll(1100);
  assert.equal(f.last().finalReached, false);
  f.scroll(1900);
  assert.equal(f.last().finalReached, true);
  assert.equal(f.last().triggered, false);
  f.scroll(2600);
  assert.equal(f.last().zoneEntered, true);
  assert.equal(f.last().triggered, false, "Same continuous scroll cannot fire");
  f.cleanup();
});

test("after reading final page and pausing, a later downward movement into the zone fires once and never closes", () => {
  const f = fixture();
  f.scroll(1900); f.settle();
  f.scroll(1850);
  assert.equal(f.last().triggered, false, "Upward scrolling cannot trigger");
  f.settle(); f.scroll(2600);
  assert.equal(f.last().triggered, true);
  assert.equal(f.last().zoneStart, 2920);
  assert.equal(f.last().scrollY, 2600);
  f.scroll(2700); f.scroll(1900); f.settle(); f.scroll(2700);
  assert.equal(f.records.filter((value, i) => value.triggered && !f.records[i - 1]?.triggered).length, 1);
  f.doc.dispatchEvent(new Event("fullscreenchange"));
  assert.equal(f.last().triggered, true, "One-time result survives later layout changes");
  assert.equal(f.last().finalReached, true);
  f.cleanup();
});

test("fullscreen, viewport and calibration reflow disarm; no initial deep scroll trigger; cleanup removes passive observers and timers", () => {
  const f = fixture();
  f.scroll(1900); f.settle();
  f.doc.fullscreenElement = f.root;
  f.doc.dispatchEvent(new Event("fullscreenchange"));
  assert.equal(f.last().finalReached, false);
  f.scroll(2600);
  assert.equal(f.last().triggered, false);
  f.scroll(1900); f.settle(); f.reflow();
  assert.equal(f.last().finalReached, false);
  f.scroll(2800);
  assert.equal(f.last().triggered, false);
  f.page.dispatchEvent(new Event("resize"));
  assert.equal(f.last().finalReached, false);
  f.scroll(2100);
  assert.ok(f.tasks.size > 0);
  f.cleanup();
  const count = f.records.length;
  f.scroll(2900); f.doc.dispatchEvent(new Event("fullscreenchange"));
  assert.equal(f.records.length, count);
  assert.equal(f.tasks.size, 0);
  assert.ok(f.registrations.every(({ options }) => options.passive === true));
});

test("standalone wrapper appends end message and document trigger zone after unchanged shared pages", () => {
  const source = readFileSync(new URL("./footswitch-return-test-display.tsx", import.meta.url), "utf8");
  const react = { ...require("react"), useRef: () => ({ current: null }), useEffect: () => {}, useState: () => [null, () => {}] };
  const { FootswitchReturnTestDisplay } = compile(source, {}, { react,
    "./footswitch-smart-paging-display": { SmartLyricPagingDisplay: () => require("react").createElement("main", { "data-existing-lyric-pages": true }, "Original lyrics") },
    "./footswitch-return-trigger": { observeReturnTrigger: () => {} } });
  const html = renderToStaticMarkup(FootswitchReturnTestDisplay({ config: { preferredSize: 56, calibration: -175 } }));
  assert.ok(html.indexOf("Original lyrics") < html.indexOf("END OF SONG"));
  assert.ok(html.indexOf("END OF SONG") < html.indexOf("data-footswitch-return-zone"));
  assert.ok(html.includes("↓ PRESS AGAIN TO RETURN TO SETLIST"));
  assert.ok(html.includes("min-height:100dvh"));
  assert.ok(html.includes("Final page reached"));
  assert.ok(!html.includes("RETURN TO SETLIST TRIGGER DETECTED"));
  assert.doesNotMatch(source + helperSource, /preventDefault|keydown|keyup|scrollTo|scrollIntoView|scrollTop\s*=|overflow-y|exitFullscreen|requestFullscreen/);
  const standalone = readFileSync(new URL("./footswitch-smart-paging-test.tsx", import.meta.url), "utf8");
  assert.match(standalone, /\[returnTestEnabled, setReturnTestEnabled\] = useState\(false\)/);
  assert.match(standalone, /returnTestEnabled \? FootswitchReturnTestDisplay : SmartLyricPagingDisplay/);
  assert.match(readFileSync(new URL("./live-smart-lyrics.tsx", import.meta.url), "utf8"), /settings\.footswitchReturnToSetlist\s*\?/);
});

test("Live callback closes once only after observer trigger, callback updates do not restart observation, and diagnostic never closes", () => {
  const source = readFileSync(new URL("./footswitch-return-test-display.tsx", import.meta.url), "utf8");
  for (const liveMode of [false, true]) {
    const refs = [], effects = [];
    let index = 0, reports, observed = 0, removed = 0, closed = 0;
    const react = { ...require("react"), useState: () => [null, () => {}], useEffect: (effect) => effects.push(effect),
      useRef: (initial) => { const i = index++; if (!refs[i]) refs[i] = { current: i === 0 ? {} : initial }; return refs[i]; } };
    const { FootswitchReturnTestDisplay } = compile(source, { window: {}, document: {} }, { react,
      "./footswitch-smart-paging-display": { SmartLyricPagingDisplay: () => null },
      "./footswitch-return-trigger": { observeReturnTrigger: (_page, _doc, _zone, report) => { observed++; reports = report; return () => { removed++; }; } } });
    const render = (callback) => { index = 0; effects.length = 0; FootswitchReturnTestDisplay({ config: { preferredSize: 56, calibration: -175 }, onTrigger: callback }); };
    render(liveMode ? () => { closed++; } : undefined);
    effects[0](); const cleanup = effects[1]();
    for (const snapshot of [{ finalReached: false, triggered: false }, { finalReached: true, triggered: false }]) reports(snapshot);
    assert.equal(closed, 0, "Neither initialization nor final verse visibility closes lyrics");
    render(liveMode ? () => { closed++; } : undefined);
    effects[0]();
    assert.equal(observed, 1, "Latest Close callback is updated without restarting observer");
    reports({ triggered: true }); reports({ triggered: true });
    assert.equal(closed, liveMode ? 1 : 0);
    cleanup(); assert.equal(removed, 1);
  }
});

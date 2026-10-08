import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("./footswitch-compact-scroll-test.tsx", import.meta.url), "utf8");
const observerSource = readFileSync(new URL("./footswitch-scroll-observation.ts", import.meta.url), "utf8");
function compile(source, moduleRequire = require) {
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  runInNewContext(output, { exports: compiledModule.exports, require: moduleRequire });
  return compiledModule.exports;
}
const { observeScrollPositions } = compile(observerSource);
function elements(element, list = []) {
  if (Array.isArray(element)) element.forEach((item) => elements(item, list));
  else if (element?.props) { list.push(element); elements(element.props.children, list); }
  return list;
}

test("120 numbered mock lines and all three sizes render in one focusable native scroll container", () => {
  let selected = 6;
  const react = require("react");
  const { CompactLyricScrollTest } = compile(source, (name) => {
    if (name === "./footswitch-scroll-observation") return { observeScrollPositions };
    if (name === "react") return {
      ...react, useRef: () => ({ current: null }), useEffect: () => {},
      useState: (initial) => typeof initial === "number" ? [selected, (next) => { selected = next; }] : [initial, () => {}],
    };
    return require(name);
  });
  const props = { onReturn: () => {}, onNativeScroll: () => {} };
  for (const [label, lines] of [["Small", 4], ["Medium", 6], ["Large", 10]]) {
    const before = elements(CompactLyricScrollTest(props));
    const button = before.find((element) => element.type === "button" && element.props.children[0] === label);
    assert.ok(button);
    button.props.onClick();
    const tree = CompactLyricScrollTest(props);
    const nodes = elements(tree);
    const viewer = nodes.find((element) => element.props["aria-label"] === "Scrollable mock lyric viewer");
    assert.equal(viewer.props.style.height, lines * 48 + 8);
    assert.equal(viewer.props.tabIndex, 0);
    assert.equal(viewer.key, null, "Resizing must not force a remount and discard scroll position");
    assert.match(viewer.props.className, /overflow-y-auto/);
    assert.equal(nodes.filter((element) => element.type === "li").length, 120);
    const html = renderToStaticMarkup(tree);
    assert.ok(html.includes(">001</span>"));
    assert.ok(html.includes(">120</span>"));
    assert.ok(html.includes("Outside Lyric Viewer"));
    assert.ok(html.includes("Main document:"));
    for (const element of nodes) {
      assert.equal(element.props.onKeyDown, undefined);
      assert.equal(element.props.onKeyUp, undefined);
      assert.doesNotMatch(element.props.className ?? "", /snap-|scroll-smooth|touch-none|overscroll-/);
    }
  }
});

test("compact experiment never writes scroll positions, cancels input, or installs keyboard controls", () => {
  for (const text of [source, observerSource]) {
    const ast = ts.createSourceFile("compact.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const forbidden = new Set(["preventDefault", "scrollTo", "scrollBy", "scrollIntoView", "requestAnimationFrame", "setInterval", "setTimeout", "listenForKeyboardInput", "listenForPointerMouseInput"]);
    function visit(node) {
      if (ts.isIdentifier(node)) assert.equal(forbidden.has(node.text), false, node.text);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        assert.doesNotMatch(node.left.getText(ast), /scrollTop|scrollLeft|scrollY|scrollX/);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.match(source, /focus\(\{ preventScroll: true \}\)/);
});

test("passive movement observation distinguishes page and container and cleans up both listeners", () => {
  class ScrollTarget extends EventTarget {
    options = [];
    addEventListener(type, handler, options) {
      assert.equal(type, "scroll");
      this.options.push(options);
      super.addEventListener(type, handler, options);
    }
  }
  const page = new ScrollTarget();
  const viewer = new ScrollTarget();
  page.scrollY = 90;
  viewer.scrollTop = 0;
  const positions = [];
  const cleanup = observeScrollPositions(page, viewer, (value) => positions.push({ ...value }));
  assert.deepEqual(positions[0], { viewer: 0, document: 90 });
  viewer.scrollTop = 144;
  viewer.dispatchEvent(new Event("scroll"));
  assert.deepEqual(positions.at(-1), { viewer: 144, document: 90 });
  page.scrollY = 500;
  page.dispatchEvent(new Event("scroll"));
  assert.deepEqual(positions.at(-1), { viewer: 144, document: 500 });
  assert.equal(page.options[0].passive, true);
  assert.equal(viewer.options[0].passive, true);
  cleanup();
  viewer.dispatchEvent(new Event("scroll"));
  page.dispatchEvent(new Event("scroll"));
  assert.equal(positions.length, 3);
});

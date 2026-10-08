import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("./footswitch-smart-paging-test.tsx", import.meta.url), "utf8");
function compile(text, moduleRequire = require) {
  const compiled = { exports: {} };
  const output = ts.transpileModule(text, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  runInNewContext(output, { exports: compiled.exports, require: moduleRequire });
  return compiled.exports;
}
const utility = compile(readFileSync(new URL("./footswitch-lyric-paging.ts", import.meta.url), "utf8"));
const samples = compile(readFileSync(new URL("./footswitch-smart-paging-samples.ts", import.meta.url), "utf8"));
const snapping = compile(readFileSync(new URL("./footswitch-document-snap.ts", import.meta.url), "utf8"));
function elements(element, list = []) {
  if (Array.isArray(element)) element.forEach((child) => elements(child, list));
  else if (element?.props) { list.push(element); elements(element.props.children, list); }
  return list;
}

test("smart view renders document-flow pages, sizing/sample controls, and passive alignment readout without hiding lyrics", () => {
  const pages = utility.paginateLyricSections(utility.splitLyricSections(samples.SMART_PAGING_SAMPLES.realistic), {
    preferredFontSize: 48, minimumFontSize: 28, contentHeight: 600,
    measureLine: (_text, font) => font * 1.4,
  });
  const { SmartLyricPagingTest } = compile(source, (name) => {
    if (name === "./footswitch-lyric-paging") return utility;
    if (name === "./footswitch-smart-paging-samples") return samples;
    if (name === "./footswitch-smart-paging-observers") return {};
    if (name === "./footswitch-document-snap") return snapping;
    if (name === "react") return {
      ...require("react"), useRef: () => ({ current: null }), useEffect: () => {},
      useState: (value) => [value?.pages ? { pages, pageHeight: 684, toolbarHeight: 160, viewportHeight: 844, documentHeight: 900 } : value, () => {}],
    };
    return require(name);
  });
  let returned = false;
  const view = SmartLyricPagingTest({ onReturn: () => { returned = true; } });
  const nodes = elements(view);
  const pageNodes = nodes.filter((node) => "data-smart-lyric-page" in node.props);
  assert.equal(pageNodes.length, 7);
  assert.ok(pageNodes.every((node) => node.props.style.minHeight === 684));
  assert.ok(pageNodes.every((node) => node.props.style.scrollSnapAlign === "start" && node.props.style.scrollMarginTop === 0));
  const snapSelector = nodes.find((node) => node.type === "select" && node.props.value === "off");
  assert.ok(snapSelector, "Snapping defaults to OFF");
  assert.deepEqual(elements(snapSelector).filter((node) => node.type === "option").map((node) => node.props.value), ["off", "proximity", "mandatory"]);
  for (const node of nodes.filter((node) => !node.props["aria-hidden"])) {
    assert.doesNotMatch(node.props.className ?? "", /overflow(?:-[xy])?-(?:auto|hidden|scroll)|snap-|scroll-smooth|touch-none/);
    assert.equal(node.props.onKeyDown, undefined);
    assert.equal(node.props.onKeyUp, undefined);
    assert.equal(node.props.onWheel, undefined);
    assert.equal(node.props.style?.height, undefined, "Pages can expand rather than cut off text");
  }
  const html = renderToStaticMarkup(view);
  assert.ok(html.includes("Page 1 of 7"));
  assert.ok(html.includes("Boundary offset: 0 px"));
  assert.ok(html.includes("Aligned"));
  for (const label of ["Large", "Extra Large", "Maximum", "Realistic song", "Long lines / overflow"]) assert.ok(html.includes(label));
  for (const section of utility.splitLyricSections(samples.SMART_PAGING_SAMPLES.realistic)) {
    for (const line of section.split("\n")) assert.ok(html.includes(line));
  }
  nodes.find((node) => node.type === "button" && node.props.children === "Back to Footswitch Test").props.onClick();
  assert.equal(returned, true);
});

test("smart experiment has no keyboard interception, scroll writes, body lock, animation, or production dependencies", () => {
  const ast = ts.createSourceFile("smart.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const forbidden = new Set(["preventDefault", "scrollTo", "scrollBy", "scrollIntoView", "requestAnimationFrame", "setInterval", "setTimeout", "listenForKeyboardInput", "listenForPointerMouseInput", "localStorage", "createClient"]);
  function visit(node) {
    if (ts.isIdentifier(node)) assert.equal(forbidden.has(node.text), false, node.text);
    if (ts.isImportDeclaration(node)) assert.ok(node.moduleSpecifier.text === "react" || node.moduleSpecifier.text.startsWith("./footswitch-"));
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      assert.doesNotMatch(node.left.getText(ast), /scrollTop|scrollLeft|scrollY|scrollX|body/);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.match(source, /useEffect\(\(\) => applyDocumentSnap\(document, snapMode, layout\.toolbarHeight\), \[snapMode, layout\.toolbarHeight\]\)/, "React effect must return the style-restoration cleanup on mode change and unmount");
});

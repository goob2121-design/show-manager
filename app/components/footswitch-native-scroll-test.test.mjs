import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const nativeSource = readFileSync(new URL("./footswitch-native-scroll-test.tsx", import.meta.url), "utf8");
const diagnosticSource = readFileSync(new URL("./footswitch-test.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(nativeSource, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;
const nativeModule = { exports: {} };
runInNewContext(output, { exports: nativeModule.exports, require });
const { NativeScrollTest } = nativeModule.exports;

function visitElements(element, callback) {
  if (!element || typeof element !== "object") return;
  if (Array.isArray(element)) { element.forEach((child) => visitElements(child, callback)); return; }
  if (!element.props) return;
  callback(element);
  visitElements(element.props.children, callback);
}

test("renders nine ordered mock lyric sections and 108 lines in document flow", () => {
  const sheet = NativeScrollTest({ onReturn: () => {} });
  const html = renderToStaticMarkup(sheet);
  const titles = ["VERSE 1", "VERSE 2", "CHORUS 1", "VERSE 3", "CHORUS 2", "BRIDGE", "VERSE 4", "CHORUS 3", "ENDING"];
  let previous = -1;
  for (const title of titles) {
    const current = html.indexOf(` · ${title}</h2>`);
    assert.ok(current > previous, `Missing or out-of-order section: ${title}`);
    previous = current;
  }
  assert.equal((html.match(/<li /g) ?? []).length, 108);
  assert.ok(html.includes(">001</span>"));
  assert.ok(html.includes(">108</span>"));
  visitElements(sheet, (element) => {
    assert.doesNotMatch(element.props.className ?? "", /(?:^|\s)(?:\w+:)*(?:overflow(?:-[xy])?-(?:auto|scroll|hidden)|h-(?:screen|full|\[)|max-h-|fixed|touch-none)/);
    assert.equal(element.props.style, undefined, "No inline height or body-scroll manipulation");
  });
});

test("native view has no diagnostic hooks, intercepted input, scroll code, or focus changes", () => {
  const ast = ts.createSourceFile("native.tsx", nativeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const forbiddenIdentifiers = new Set([
    "require", "window", "document", "useEffect", "useLayoutEffect", "preventDefault",
    "addEventListener", "scrollTo", "scrollBy", "scrollIntoView", "scrollTop", "focus",
    "requestAnimationFrame", "setInterval", "setTimeout",
  ]);
  function checkCode(node) {
    assert.equal(ts.isImportDeclaration(node), false, "Native view must not import diagnostic subscriptions");
    if (ts.isIdentifier(node)) assert.equal(forbiddenIdentifiers.has(node.text), false, `Forbidden browser/effect API: ${node.text}`);
    ts.forEachChild(node, checkCode);
  }
  checkCode(ast);
  let returns = 0;
  const sheet = NativeScrollTest({ onReturn: () => { returns++; } });
  visitElements(sheet, (element) => {
    for (const prop of Object.keys(element.props)) {
      if (/^on[A-Z]/.test(prop)) {
        assert.equal(element.type, "button");
        assert.equal(prop, "onClick", "Only the explicit return control has an event handler");
        element.props.onClick();
      }
    }
    assert.equal(element.props.ref, undefined);
    assert.equal(element.props.autoFocus, undefined);
  });
  assert.equal(returns, 2, "Return controls are accessible at both ends of the sheet");
});

test("mode switch mounts mutually exclusive component types, leaving listeners in the unmounted diagnostic", () => {
  const ast = ts.createSourceFile("footswitch-test.tsx", diagnosticSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "FootswitchTest");
  assert.ok(wrapper?.body);
  const result = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(result && ts.isConditionalExpression(result));
  assert.ok(ts.isJsxSelfClosingElement(result.whenTrue));
  assert.equal(result.whenTrue.tagName.getText(ast), "NativeScrollTest");
  assert.ok(ts.isConditionalExpression(result.whenFalse));
  assert.ok(ts.isJsxSelfClosingElement(result.whenFalse.whenTrue));
  assert.equal(result.whenFalse.whenTrue.tagName.getText(ast), "CompactLyricScrollTest");
  assert.ok(ts.isConditionalExpression(result.whenFalse.whenFalse));
  assert.equal(result.whenFalse.whenFalse.whenTrue.tagName.getText(ast), "FootswitchLibraryPagingTest");
  assert.equal(result.whenFalse.whenFalse.whenFalse.tagName.getText(ast), "FootswitchEventDiagnostic");
  assert.doesNotMatch(wrapper.getText(ast), /useEffect|listenForKeyboardInput|listenForPointerMouseInput/);
  const eventView = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "FootswitchEventDiagnostic");
  assert.ok(eventView);
  assert.match(eventView.getText(ast), /listenForKeyboardInput\(window/);
  assert.match(eventView.getText(ast), /listenForPointerMouseInput\(window/);
  assert.match(eventView.getText(ast), /return \(\) => \{\s*unsubscribe\(\);\s*unsubscribePointer\(\);/);
});

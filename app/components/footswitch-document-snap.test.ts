import assert from "node:assert/strict";
import test from "node:test";
const { applyDocumentSnap, alignmentStatus, DOCUMENT_SNAP_MODES } = await import(new URL("./footswitch-document-snap.ts", import.meta.url).href) as typeof import("./footswitch-document-snap");

class InlineStyle {
  declarations = new Map<string, { value: string; priority: string }>();
  getPropertyValue(property: string) { return this.declarations.get(property)?.value ?? ""; }
  getPropertyPriority(property: string) { return this.declarations.get(property)?.priority ?? ""; }
  setProperty(property: string, value: string, priority = "") { this.declarations.set(property, { value, priority }); }
  removeProperty(property: string) { const value = this.getPropertyValue(property); this.declarations.delete(property); return value; }
}
function element() { return { style: new InlineStyle() }; }
function standardDocument() {
  const root = element(), body = element();
  return { root, body, document: { scrollingElement: root, documentElement: root, body, compatMode: "CSS1Compat" } as unknown as Document };
}

test("all three snap modes apply to the standards document scroller and restore original values/priorities", () => {
  assert.deepEqual(DOCUMENT_SNAP_MODES.map((mode) => mode.value), ["off", "proximity", "mandatory"]);
  for (const [mode, expected] of [["off", "none"], ["proximity", "y proximity"], ["mandatory", "y mandatory"]] as const) {
    const { root, body, document } = standardDocument();
    root.style.setProperty("scroll-snap-type", "x proximity", "important");
    root.style.setProperty("scroll-padding-top", "11px", "important");
    root.style.setProperty("color", "red");
    const cleanup = applyDocumentSnap(document, mode, 175.5);
    assert.equal(root.style.getPropertyValue("scroll-snap-type"), expected);
    assert.equal(root.style.getPropertyValue("scroll-padding-top"), mode === "off" ? "11px" : "175.5px");
    assert.equal(body.style.declarations.size, 0, "Standards body is not the viewport snap owner");
    root.style.setProperty("color", "blue");
    cleanup();
    assert.equal(root.style.getPropertyValue("scroll-snap-type"), "x proximity");
    assert.equal(root.style.getPropertyPriority("scroll-snap-type"), "important");
    assert.equal(root.style.getPropertyValue("scroll-padding-top"), "11px");
    assert.equal(root.style.getPropertyPriority("scroll-padding-top"), "important");
    assert.equal(root.style.getPropertyValue("color"), "blue", "Do not overwrite unrelated inline edits");
    cleanup();
    assert.equal(root.style.getPropertyValue("scroll-padding-top"), "11px", "Cleanup is idempotent");
  }
});

test("changing modes and toolbar heights leaves no experimental properties after cleanup", () => {
  const { root, document } = standardDocument();
  let cleanup = applyDocumentSnap(document, "proximity", 120);
  cleanup();
  cleanup = applyDocumentSnap(document, "mandatory", 220);
  assert.equal(root.style.getPropertyValue("scroll-padding-top"), "220px");
  cleanup();
  cleanup = applyDocumentSnap(document, "off", 220);
  assert.equal(root.style.getPropertyValue("scroll-snap-type"), "none");
  assert.equal(root.style.getPropertyValue("scroll-padding-top"), "");
  cleanup();
  assert.equal(root.style.declarations.size, 0);
});

test("body-scrolling documents include root for viewport propagation; null scroller uses document mode fallback", () => {
  for (const missing of [false, true]) {
    const root = element(), body = element();
    const document = { scrollingElement: missing ? null : body, documentElement: root, body, compatMode: "BackCompat" } as unknown as Document;
    const cleanup = applyDocumentSnap(document, "mandatory", 140);
    for (const target of [root, body]) {
      assert.equal(target.style.getPropertyValue("scroll-snap-type"), "y mandatory");
      assert.equal(target.style.getPropertyValue("scroll-padding-top"), "140px");
    }
    cleanup();
    assert.equal(root.style.declarations.size, 0);
    assert.equal(body.style.declarations.size, 0);
  }
  const { root, body, document } = standardDocument();
  Object.assign(document, { scrollingElement: null });
  const cleanup = applyDocumentSnap(document, "proximity", -10);
  assert.equal(root.style.getPropertyValue("scroll-padding-top"), "0px");
  assert.equal(body.style.declarations.size, 0);
  cleanup();
});

test("alignment status treats both scroll directions identically with explicit diagnostic thresholds", () => {
  for (const sign of [1, -1]) {
    assert.equal(alignmentStatus(sign * 2), "Aligned");
    assert.equal(alignmentStatus(sign * 2.1), "Slightly Off");
    assert.equal(alignmentStatus(sign * 24), "Slightly Off");
    assert.equal(alignmentStatus(sign * 24.1), "Misaligned");
  }
});

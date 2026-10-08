import assert from "node:assert/strict";
import test from "node:test";
const { observePagingViewport, observeLyricPagePosition } = await import(new URL("./footswitch-smart-paging-observers.ts", import.meta.url).href) as typeof import("./footswitch-smart-paging-observers");

test("visual viewport/chrome, toolbar, and width changes remeasure; all observers/listeners clean up", () => {
  let observerCallback = () => {};
  let disconnected = false;
  class FakeResizeObserver {
    constructor(callback: () => void) { observerCallback = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const page = Object.assign(new EventTarget(), { innerHeight: 900, visualViewport: Object.assign(new EventTarget(), { height: 800 }), ResizeObserver: FakeResizeObserver });
  let height = 120, width = 1000;
  const toolbar = { getBoundingClientRect: () => ({ height }) } as HTMLElement;
  const rail = { getBoundingClientRect: () => ({ width }) } as HTMLElement;
  const readings: unknown[] = [];
  const cleanup = observePagingViewport(page as unknown as Window & typeof globalThis, toolbar, rail, (value) => readings.push(value));
  assert.deepEqual(readings[0], { height: 800, toolbarHeight: 120, width: 1000 });
  observerCallback();
  assert.equal(readings.length, 1, "Identical layout must not cause a resize feedback loop");
  page.visualViewport.height = 700;
  page.visualViewport.dispatchEvent(new Event("resize"));
  height = 160; width = 700;
  observerCallback();
  assert.equal(readings.length, 3);
  assert.deepEqual(readings.at(-1), { height: 700, toolbarHeight: 160, width: 700 });
  cleanup();
  assert.equal(disconnected, true);
  page.visualViewport.height = 600;
  page.visualViewport.dispatchEvent(new Event("resize"));
  page.dispatchEvent(new Event("resize"));
  assert.equal(readings.length, 3);
});

test("position observation is passive and removes document and visual viewport listeners", () => {
  class PassiveTarget extends EventTarget {
    addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      assert.equal(typeof options === "object" && options.passive, true);
      super.addEventListener(type, callback, options);
    }
  }
  const page = Object.assign(new PassiveTarget(), { visualViewport: new PassiveTarget() });
  let calls = 0;
  const cleanup = observeLyricPagePosition(page as unknown as Window, () => { calls++; });
  page.dispatchEvent(new Event("scroll"));
  page.visualViewport.dispatchEvent(new Event("resize"));
  assert.equal(calls, 3);
  cleanup();
  for (const target of [page, page.visualViewport]) for (const type of ["scroll", "resize"]) target.dispatchEvent(new Event(type));
  assert.equal(calls, 3);
});

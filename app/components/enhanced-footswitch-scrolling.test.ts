import assert from "node:assert/strict";
import test from "node:test";
const { createEnhancedFootswitchScrolling } = await import(new URL("./enhanced-footswitch-scrolling.ts", import.meta.url).href) as typeof import("./enhanced-footswitch-scrolling");

function fixture(options = { enabled: true, speed: 200, inactivityMs: 180 }) {
  let now = 0, sequence = 0, focused = true, viewer = true;
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, { at: number; callback: () => void }>();
  const scroller = { scrollTop: 100, scrollTo({ top, behavior }: ScrollToOptions) {
    assert.equal(behavior, "instant");
    this.scrollTop = Math.max(0, Math.min(10000, top ?? 0));
  } };
  const page = Object.assign(new EventTarget(), {
    performance: { now: () => now }, visualViewport: new EventTarget(),
    requestAnimationFrame: (fn: FrameRequestCallback) => { frames.set(++sequence, fn); return sequence; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    setTimeout: (callback: () => void, delay: number) => { timers.set(++sequence, { at: now + delay, callback }); return sequence; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible", scrollingElement: scroller,
    hasFocus: () => focused, getElementById: () => viewer ? {} : null });
  const controller = createEnhancedFootswitchScrolling(page as unknown as Window, doc as unknown as Document, options);
  const key = (type: string, value = "ArrowDown", extra = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { key: value, repeat: false, ...extra });
    page.dispatchEvent(event); return event;
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, task] of [...timers]) if (task.at <= now) { timers.delete(id); task.callback(); }
    const pending = [...frames]; frames.clear(); pending.forEach(([, fn]) => fn(now));
  };
  return { page, doc, scroller, frames, timers, controller, key, advance,
    focus: (value: boolean) => { focused = value; }, viewer: (value: boolean) => { viewer = value; } };
}

test("OFF leaves native key defaults and scrolling untouched", () => {
  const f = fixture({ enabled: false, speed: 500, inactivityMs: 180 });
  assert.equal(f.key("keydown").defaultPrevented, false);
  assert.equal(f.key("keyup").defaultPrevented, false);
  assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
  f.advance(100); assert.equal(f.scroller.scrollTop, 100);
  f.controller.destroy();
});

test("paired repeat-false pulses merge into one loop and stop within the inactivity bound", () => {
  const f = fixture();
  for (let i = 0; i < 6; i++) {
    assert.equal(f.key("keydown").defaultPrevented, true);
    assert.equal(f.key("keyup").defaultPrevented, true);
    assert.equal(f.frames.size, 1); assert.equal(f.timers.size, 1);
    f.advance(40);
  }
  assert.equal(f.scroller.scrollTop, 148);
  f.advance(40); f.advance(40); f.advance(40);
  assert.equal(f.scroller.scrollTop, 172);
  f.advance(20);
  assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
  const stopped = f.scroller.scrollTop;
  f.advance(1000); assert.equal(f.scroller.scrollTop, stopped);
  f.controller.destroy();
});

test("speed is elapsed-time based and direction changes do not create another loop", () => {
  for (const speed of [100, 200, 350, 500]) {
    const f = fixture({ enabled: true, speed, inactivityMs: 180 });
    f.key("keydown"); f.advance(20); f.advance(30);
    assert.ok(Math.abs(f.scroller.scrollTop - (100 + speed * .05)) < .0001);
    f.key("keydown", "ArrowUp", { repeat: true });
    assert.equal(f.frames.size, 1); f.advance(50);
    assert.ok(Math.abs(f.scroller.scrollTop - 100) < .0001);
    f.controller.destroy();
  }
});

test("modifiers, composing, editable focus and non-arrow keys preserve defaults", () => {
  const f = fixture();
  for (const extra of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }]) {
    assert.equal(f.key("keydown", "ArrowDown", extra).defaultPrevented, false);
  }
  assert.equal(f.key("keydown", "PageDown").defaultPrevented, false);
  const event = new Event("keydown", { cancelable: true });
  Object.assign(event, { key: "ArrowDown" });
  Object.defineProperty(event, "target", { value: { closest: () => ({}) } });
  f.page.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false); assert.equal(f.frames.size, 0);
  f.controller.destroy();
});

test("touch and pointer gestures stop animation and suppress new pulses until released", () => {
  for (const [start, end] of [["touchstart", "touchend"], ["pointerdown", "pointerup"]]) {
    const f = fixture(); f.key("keydown"); f.advance(20);
    const gesture = new Event(start, { cancelable: true }); f.page.dispatchEvent(gesture);
    assert.equal(gesture.defaultPrevented, false);
    f.key("keydown"); assert.equal(f.frames.size, 0);
    f.page.dispatchEvent(new Event(end)); f.key("keydown");
    assert.equal(f.frames.size, 1); f.controller.destroy();
  }
});

test("manual wheel, focus loss, hidden state, fullscreen and resize cancel pending movement", () => {
  for (const type of ["wheel", "blur", "pagehide", "resize", "orientationchange", "focusin", "visibilitychange", "fullscreenchange"]) {
    const f = fixture(); f.key("keydown"); f.advance(20);
    const position = f.scroller.scrollTop;
    const target = ["visibilitychange", "fullscreenchange"].includes(type) ? f.doc : f.page;
    target.dispatchEvent(new Event(type));
    assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
    f.advance(200); assert.equal(f.scroller.scrollTop, position); f.controller.destroy();
  }
  const f = fixture(); f.key("keydown"); f.page.dispatchEvent(new Event("wheel"));
  f.key("keydown"); assert.equal(f.frames.size, 0);
  f.advance(180); f.key("keydown"); assert.equal(f.frames.size, 1);
  f.controller.destroy();
});

test("viewer removal, hidden or unfocused document and cleanup cannot continue scrolling", () => {
  for (const hide of [(f: ReturnType<typeof fixture>) => f.viewer(false),
    (f: ReturnType<typeof fixture>) => f.focus(false),
    (f: ReturnType<typeof fixture>) => { f.doc.visibilityState = "hidden"; }]) {
    const f = fixture(); f.key("keydown"); hide(f); f.advance(20);
    assert.equal(f.scroller.scrollTop, 100); assert.equal(f.frames.size, 0);
    f.controller.destroy();
  }
  const f = fixture(); f.key("keydown"); f.controller.destroy();
  assert.equal(f.key("keydown").defaultPrevented, false);
  assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
});

test("long frames do not jump and document boundaries cancel the loop", () => {
  const f = fixture({ enabled: true, speed: 500, inactivityMs: 300 });
  f.key("keydown"); f.advance(250); assert.equal(f.scroller.scrollTop, 125);
  f.scroller.scrollTop = 10000; f.key("keydown"); f.advance(20);
  assert.equal(f.scroller.scrollTop, 10000); assert.equal(f.frames.size, 0);
  f.controller.destroy();
});

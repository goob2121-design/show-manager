import assert from "node:assert/strict";
import test from "node:test";
import type { PointerMouseInputRecord } from "./footswitch-pointer-events";

const { listenForPointerMouseInput, POINTER_MOUSE_EVENT_TYPES } = await import(new URL("./footswitch-pointer-events.ts", import.meta.url).href) as typeof import("./footswitch-pointer-events");

function harness() {
  const target = new EventTarget();
  const records: PointerMouseInputRecord[] = [];
  let inArea = true;
  const unsubscribe = listenForPointerMouseInput(target as unknown as Window, () => inArea, (input) => records.push(input));
  const dispatch = (type: string, pointer = false, cancelable = true) => {
    const event = new Event(type, { cancelable });
    Object.assign(event, { button: 2, buttons: type.endsWith("down") ? 2 : 0, clientX: 130, clientY: 245 });
    if (pointer) Object.assign(event, { pointerType: "mouse", pointerId: 0, isPrimary: false });
    // Node has no DOM; provide a realistic element target for the snapshot.
    Object.defineProperty(event, "target", { value: { tagName: "SECTION", id: "footswitch-input-test-area" } });
    target.dispatchEvent(event);
    return event;
  };
  return { target, records, dispatch, unsubscribe, outside: () => { inArea = false; } };
}

test("records all seven pointer/mouse event types with target, coordinates, and timestamps", () => {
  const { records, dispatch, unsubscribe } = harness();
  for (const type of POINTER_MOUSE_EVENT_TYPES) dispatch(type, type.startsWith("pointer"));
  assert.deepEqual(records.map((input) => input.type), [...POINTER_MOUSE_EVENT_TYPES]);
  assert.equal(records[0].kind, "POINTER/MOUSE");
  assert.equal(records[0].button, 2);
  assert.equal(records[0].buttons, 2);
  assert.equal(records[1].buttons, 0);
  assert.equal(records[0].clientX, 130);
  assert.equal(records[0].clientY, 245);
  assert.equal(records[0].target, "section#footswitch-input-test-area");
  assert.equal(records[0].pointerType, "mouse");
  assert.equal(records[0].pointerId, 0);
  assert.equal(records[0].isPrimary, false);
  assert.equal(records[2].pointerType, null);
  assert.equal(records[2].pointerId, null);
  assert.equal(records[2].isPrimary, null);
  assert.ok(Number.isFinite(Date.parse(records[0].timestamp)));
  assert.equal(typeof records[0].eventTimestamp, "number");
  unsubscribe();
});

test("blocks activation/context menus only inside the area without suppressing down/up compatibility events", () => {
  const { records, dispatch, outside, unsubscribe } = harness();
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup"]) {
    assert.equal(dispatch(type).defaultPrevented, false);
  }
  for (const type of ["click", "auxclick", "contextmenu"]) {
    assert.equal(dispatch(type).defaultPrevented, true);
    assert.equal(records.at(-1)?.defaultPrevented, true);
  }
  assert.equal(dispatch("contextmenu", false, false).defaultPrevented, false);
  outside();
  for (const type of POINTER_MOUSE_EVENT_TYPES) {
    assert.equal(dispatch(type).defaultPrevented, false);
    assert.equal(records.at(-1)?.inTestArea, false);
  }
  unsubscribe();
});

test("keeps control clicks working outside the area and removes all listeners on exit", () => {
  const { target, records, dispatch, outside, unsubscribe } = harness();
  let controlClicks = 0;
  target.addEventListener("click", () => controlClicks++);
  dispatch("click");
  assert.equal(controlClicks, 0);
  outside();
  dispatch("click");
  assert.equal(controlClicks, 1);
  const recorded = records.length;
  unsubscribe();
  for (const type of POINTER_MOUSE_EVENT_TYPES) assert.equal(dispatch(type).defaultPrevented, false);
  assert.equal(records.length, recorded);
  assert.equal(controlClicks, 2);
});

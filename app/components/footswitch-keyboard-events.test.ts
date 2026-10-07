import assert from "node:assert/strict";
import test from "node:test";
import type { KeyboardInputRecord } from "./footswitch-keyboard-events";

const { listenForKeyboardInput, KEYBOARD_EVENT_TYPES } = await import(new URL("./footswitch-keyboard-events.ts", import.meta.url).href) as typeof import("./footswitch-keyboard-events");

function harness() {
  const target = new EventTarget();
  const records: KeyboardInputRecord[] = [];
  const unsubscribe = listenForKeyboardInput(target as unknown as Window, (record) => records.push(record));
  const dispatch = (type: string, key: string, code = key, keyCode = 0) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { key, code, keyCode, which: keyCode, altKey: false, ctrlKey: true, shiftKey: false, metaKey: false, repeat: false, location: 0, isComposing: false });
    target.dispatchEvent(event);
    return event;
  };
  return { target, records, unsubscribe, dispatch };
}

test("captures every navigation command on press and release and blocks default actions", () => {
  const { records, dispatch, unsubscribe } = harness();
  const keys = ["PageUp", "PageDown", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "];
  for (const key of keys) for (const type of ["keydown", "keyup"]) {
    assert.equal(dispatch(type, key, key === " " ? "Space" : key).defaultPrevented, true);
    assert.equal(records.at(-1)?.key, key);
    assert.equal(records.at(-1)?.code, key === " " ? "Space" : key);
    assert.equal(records.at(-1)?.type, type);
  }
  assert.equal(records.length, 16);
  assert.equal(records[0].ctrl, true);
  assert.ok(Number.isFinite(Date.parse(records[0].timestamp)));
  unsubscribe();
});

test("captures unknown keys, empty Safari code, legacy codes, and keypress", () => {
  const { records, dispatch, unsubscribe } = harness();
  assert.equal(dispatch("keydown", "Unidentified", "").defaultPrevented, false);
  assert.equal(records[0].code, "");
  assert.equal(dispatch("keydown", "Unidentified", "", 34).defaultPrevented, true);
  assert.equal(records[1].keyCode, 34);
  assert.equal(records[1].which, 34);
  dispatch("keypress", "x", "KeyX");
  assert.equal(records[2].type, "keypress");
  unsubscribe();
});

test("isolates app shortcuts while listening and removes every listener on exit", () => {
  const { target, records, dispatch, unsubscribe } = harness();
  let applicationCalls = 0;
  for (const type of KEYBOARD_EVENT_TYPES) target.addEventListener(type, () => applicationCalls++);
  for (const type of KEYBOARD_EVENT_TYPES) dispatch(type, "PageDown");
  assert.equal(applicationCalls, 0);
  assert.equal(records.length, 3);
  unsubscribe();
  for (const type of KEYBOARD_EVENT_TYPES) assert.equal(dispatch(type, "PageDown").defaultPrevented, false);
  assert.equal(applicationCalls, 3);
  assert.equal(records.length, 3);
});

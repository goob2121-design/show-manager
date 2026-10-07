export const KEYBOARD_EVENT_TYPES = ["keydown", "keyup", "keypress"] as const;

const NAVIGATION_KEYS = new Set([
  "PageUp", "PageDown", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Enter", " ", "Space", "Spacebar", "Home", "End",
]);
const NAVIGATION_KEY_CODES = new Set([13, 32, 33, 34, 35, 36, 37, 38, 39, 40]);

export type KeyboardInputRecord = {
  kind: "KEYBOARD";
  type: string; key: string; code: string; keyCode: number; which: number;
  alt: boolean; ctrl: boolean; shift: boolean; meta: boolean;
  timestamp: string; eventTimestamp: number; repeat: boolean; location: number;
  isComposing: boolean; isTrusted: boolean; defaultPrevented: boolean;
};

// This subscription belongs only to the mounted diagnostic, never to Live Mode.
export function listenForKeyboardInput(target: Window, onInput: (input: KeyboardInputRecord) => void) {
  const capture = (event: KeyboardEvent) => {
    if (NAVIGATION_KEYS.has(event.key) || NAVIGATION_KEYS.has(event.code) || NAVIGATION_KEY_CODES.has(event.keyCode)) {
      event.preventDefault();
    }
    // Keep diagnostic input away from application shortcuts, including unknown keys.
    event.stopImmediatePropagation();
    onInput({
      kind: "KEYBOARD",
      type: event.type, key: event.key, code: event.code, keyCode: event.keyCode, which: event.which,
      alt: event.altKey, ctrl: event.ctrlKey, shift: event.shiftKey, meta: event.metaKey,
      timestamp: new Date().toISOString(), eventTimestamp: event.timeStamp,
      repeat: event.repeat, location: event.location, isComposing: event.isComposing,
      isTrusted: event.isTrusted, defaultPrevented: event.defaultPrevented,
    });
  };
  for (const type of KEYBOARD_EVENT_TYPES) target.addEventListener(type, capture, { capture: true, passive: false });
  return () => {
    for (const type of KEYBOARD_EVENT_TYPES) target.removeEventListener(type, capture, { capture: true });
  };
}

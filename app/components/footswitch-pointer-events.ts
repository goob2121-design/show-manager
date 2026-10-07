export const POINTER_MOUSE_EVENT_TYPES = [
  "pointerdown", "pointerup", "mousedown", "mouseup", "click", "auxclick", "contextmenu",
] as const;

export type PointerMouseInputRecord = {
  kind: "POINTER/MOUSE"; type: string; button: number; buttons: number;
  pointerType: string | null; pointerId: number | null; isPrimary: boolean | null;
  clientX: number; clientY: number; target: string; inTestArea: boolean;
  timestamp: string; eventTimestamp: number; isTrusted: boolean; defaultPrevented: boolean;
};

// Observe across the diagnostic so an OS-positioned click outside the area is visible.
// Cancel only activation/context-menu defaults inside the neutral area. In particular,
// do not cancel pointerdown: that can suppress the compatibility mouse events we need to inspect.
export function listenForPointerMouseInput(
  target: Window,
  isInTestArea: (event: MouseEvent) => boolean,
  onInput: (input: PointerMouseInputRecord) => void,
) {
  const capture = (event: MouseEvent) => {
    const inTestArea = isInTestArea(event);
    if (inTestArea && ["click", "auxclick", "contextmenu"].includes(event.type)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    const pointer = event as Partial<PointerEvent>;
    const element = event.target && "tagName" in event.target ? event.target as Element : null;
    onInput({
      kind: "POINTER/MOUSE", type: event.type, button: event.button, buttons: event.buttons,
      pointerType: typeof pointer.pointerType === "string" ? pointer.pointerType : null,
      pointerId: typeof pointer.pointerId === "number" ? pointer.pointerId : null,
      isPrimary: typeof pointer.isPrimary === "boolean" ? pointer.isPrimary : null,
      clientX: event.clientX, clientY: event.clientY,
      target: element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}` : "(no element)",
      inTestArea, timestamp: new Date().toISOString(), eventTimestamp: event.timeStamp,
      isTrusted: event.isTrusted, defaultPrevented: event.defaultPrevented,
    });
  };
  for (const type of POINTER_MOUSE_EVENT_TYPES) target.addEventListener(type, capture, { capture: true, passive: false });
  return () => {
    for (const type of POINTER_MOUSE_EVENT_TYPES) target.removeEventListener(type, capture, { capture: true });
  };
}

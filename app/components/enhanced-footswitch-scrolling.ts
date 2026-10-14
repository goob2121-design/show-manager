export const FOOTSWITCH_SCROLL_SPEEDS = [
  { label: "Slow", pixelsPerSecond: 100 },
  { label: "Medium", pixelsPerSecond: 200 },
  { label: "Fast", pixelsPerSecond: 350 },
  { label: "Extra Fast", pixelsPerSecond: 500 },
] as const;

export function createEnhancedFootswitchScrolling(
  page: Window, doc: Document,
  options: { enabled: boolean; speed: number; inactivityMs: number },
) {
  let frame: number | null = null, timer: number | null = null;
  let direction = 0, previous = 0, deadline = 0, disposed = false;
  let interacting = false, manualUntil = 0;
  const speed = FOOTSWITCH_SCROLL_SPEEDS.some((item) => item.pixelsPerSecond === options.speed) ? options.speed : 200;
  const inactivityMs = Number.isFinite(options.inactivityMs) ? Math.max(80, Math.min(300, options.inactivityMs)) : 180;
  const stop = () => {
    if (frame !== null) page.cancelAnimationFrame(frame);
    if (timer !== null) page.clearTimeout(timer);
    frame = timer = null;
    direction = 0;
  };
  const active = () => !disposed && doc.visibilityState === "visible" && doc.hasFocus()
    && Boolean(doc.getElementById("smart-lyric-paging-display"));
  const animate = (now: number) => {
    frame = null;
    if (!active() || now >= deadline) { stop(); return; }
    const scroller = doc.scrollingElement;
    if (!scroller) { stop(); return; }
    // Never catch up a stalled/background frame with a large jump.
    const elapsed = Math.max(0, Math.min(50, now - previous));
    previous = now;
    const before = scroller.scrollTop;
    scroller.scrollTo({ top: before + direction * speed * elapsed / 1000, behavior: "instant" });
    if (scroller.scrollTop === before && elapsed > 0) { stop(); return; }
    frame = page.requestAnimationFrame(animate);
  };
  const keyboard = (event: KeyboardEvent) => {
    const target = event.target as Element | null;
    if (!active() || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || target?.closest?.("input, textarea, select, button, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='slider'], [role='combobox'], [role='spinbutton']")) {
      stop(); return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    if (interacting || page.performance.now() < manualUntil) { stop(); return; }
    // Some pedals send a keyup for every pulse, even during a physical hold.
    if (event.type === "keyup") return;
    direction = event.key === "ArrowDown" ? 1 : -1;
    const now = page.performance.now();
    deadline = now + inactivityMs;
    if (timer !== null) page.clearTimeout(timer);
    timer = page.setTimeout(stop, inactivityMs);
    if (frame === null) {
      previous = now;
      frame = page.requestAnimationFrame(animate);
    }
  };
  if (!options.enabled) return { stop, destroy: stop };
  page.addEventListener("keydown", keyboard, { capture: true, passive: false });
  page.addEventListener("keyup", keyboard, { capture: true, passive: false });
  const interrupt = () => { interacting = false; manualUntil = 0; stop(); };
  const interrupts = ["blur", "pagehide", "resize", "orientationchange", "focusin"];
  for (const type of interrupts) page.addEventListener(type, interrupt, { passive: true });
  const beginInteraction = () => { interacting = true; stop(); };
  const endInteraction = (event: Event) => { interacting = "touches" in event && (event as TouchEvent).touches.length > 0; };
  const wheel = () => { manualUntil = page.performance.now() + inactivityMs; stop(); };
  for (const type of ["touchstart", "pointerdown"]) page.addEventListener(type, beginInteraction, { passive: true });
  for (const type of ["touchend", "touchcancel", "pointerup", "pointercancel"]) page.addEventListener(type, endInteraction, { passive: true });
  page.addEventListener("wheel", wheel, { passive: true });
  doc.addEventListener("visibilitychange", interrupt);
  doc.addEventListener("fullscreenchange", interrupt);
  page.visualViewport?.addEventListener("resize", interrupt, { passive: true });
  return {
    stop,
    destroy() {
      disposed = true;
      stop();
      page.removeEventListener("keydown", keyboard, { capture: true });
      page.removeEventListener("keyup", keyboard, { capture: true });
      for (const type of interrupts) page.removeEventListener(type, interrupt);
      for (const type of ["touchstart", "pointerdown"]) page.removeEventListener(type, beginInteraction);
      for (const type of ["touchend", "touchcancel", "pointerup", "pointercancel"]) page.removeEventListener(type, endInteraction);
      page.removeEventListener("wheel", wheel);
      doc.removeEventListener("visibilitychange", interrupt);
      doc.removeEventListener("fullscreenchange", interrupt);
      page.visualViewport?.removeEventListener("resize", interrupt);
    },
  };
}

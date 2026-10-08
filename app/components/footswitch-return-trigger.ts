export type ReturnTriggerSnapshot = { scrollY: number; zoneStart: number | null; finalReached: boolean; zoneEntered: boolean; triggered: boolean };

// Observe scroll episodes, not pedal presses. A quiet interval must separate
// reaching the readable final page from the later downward trigger movement.
export function observeReturnTrigger(page: Window, doc: Document, zone: HTMLElement, report: (snapshot: ReturnTriggerSnapshot) => void) {
  let armed = false, reached = false, fired = false;
  let previousY = page.scrollY, signature = "", quiet: ReturnType<typeof setTimeout> | null = null;
  const cancelQuiet = () => { if (quiet !== null) clearTimeout(quiet); quiet = null; };
  const measure = () => {
    const final = doc.querySelector("#smart-lyric-paging-display [data-smart-lyric-page]:last-child");
    if (!final) return null;
    const rect = final.getBoundingClientRect(), closing = zone.getBoundingClientRect();
    const viewport = page.visualViewport;
    const top = Math.max(viewport?.offsetTop ?? 0, doc.querySelector("#smart-lyric-paging-display header")?.getBoundingClientRect().bottom ?? 0);
    const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? page.innerHeight);
    return { top, bottom, rect, closing, start: closing.top + page.scrollY,
      signature: JSON.stringify([Math.round((rect.bottom + page.scrollY) * 10), Math.round((closing.top + page.scrollY) * 10),
        page.innerWidth, viewport?.height ?? page.innerHeight, viewport?.offsetTop ?? 0, top, doc.fullscreenElement === doc.documentElement]) };
  };
  const publish = (geometry: ReturnType<typeof measure>) => report({ scrollY: page.scrollY, zoneStart: geometry?.start ?? null,
    finalReached: reached, zoneEntered: Boolean(geometry && geometry.closing.top < geometry.bottom && geometry.closing.bottom > geometry.top), triggered: fired });
  const reset = () => {
    cancelQuiet(); armed = false;
    if (!fired) reached = false;
    previousY = page.scrollY;
    const geometry = measure(); signature = geometry?.signature ?? "";
    publish(geometry);
  };
  const scroll = () => {
    const geometry = measure();
    if (!geometry || geometry.signature !== signature) { reset(); return; }
    const downward = page.scrollY > previousY + 0.5;
    previousY = page.scrollY;
    if (!fired && armed && downward && geometry.closing.top <= geometry.top + (geometry.bottom - geometry.top) * 0.35 && geometry.closing.bottom > geometry.top) fired = true;
    // Seeing only the top of the final verse never arms the experiment.
    if (geometry.rect.bottom <= geometry.bottom + 0.5 && geometry.rect.bottom > geometry.top && geometry.rect.top < geometry.bottom) reached = true;
    cancelQuiet();
    if (!fired && reached) quiet = setTimeout(() => { quiet = null; armed = true; }, 250);
    publish(geometry);
  };
  page.addEventListener("scroll", scroll, { passive: true });
  page.addEventListener("resize", reset, { passive: true });
  page.visualViewport?.addEventListener("resize", reset, { passive: true });
  doc.addEventListener("fullscreenchange", reset);
  // Establish a fresh baseline when async lyric measurement renders/reflows pages.
  const Resize = (page as Window & typeof globalThis).ResizeObserver;
  const layoutObserver = typeof Resize === "function" ? new Resize(reset) : null;
  const viewer = doc.querySelector("#smart-lyric-paging-display");
  if (viewer) layoutObserver?.observe(viewer);
  reset();
  return () => {
    cancelQuiet();
    layoutObserver?.disconnect();
    page.removeEventListener("scroll", scroll);
    page.removeEventListener("resize", reset);
    page.visualViewport?.removeEventListener("resize", reset);
    doc.removeEventListener("fullscreenchange", reset);
  };
}

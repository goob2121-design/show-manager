export type PagingViewport = { height: number; toolbarHeight: number; width: number };

export function observePagingViewport(
  page: Window & typeof globalThis, toolbar: HTMLElement, rail: HTMLElement,
  onViewport: (viewport: PagingViewport) => void,
) {
  let previous = "";
  const report = () => {
    const viewport = {
      height: page.visualViewport?.height ?? page.innerHeight,
      toolbarHeight: toolbar.getBoundingClientRect().height,
      width: rail.getBoundingClientRect().width,
    };
    const signature = JSON.stringify(viewport);
    if (signature !== previous && viewport.width > 0) { previous = signature; onViewport(viewport); }
  };
  const observer = typeof page.ResizeObserver === "function" ? new page.ResizeObserver(report) : null;
  observer?.observe(toolbar);
  observer?.observe(rail);
  page.addEventListener("resize", report, { passive: true });
  page.visualViewport?.addEventListener("resize", report, { passive: true });
  report();
  return () => {
    observer?.disconnect();
    page.removeEventListener("resize", report);
    page.visualViewport?.removeEventListener("resize", report);
  };
}

export function observeLyricPagePosition(
  page: Window, onPosition: () => void,
) {
  page.addEventListener("scroll", onPosition, { passive: true });
  page.addEventListener("resize", onPosition, { passive: true });
  page.visualViewport?.addEventListener("resize", onPosition, { passive: true });
  page.visualViewport?.addEventListener("scroll", onPosition, { passive: true });
  onPosition();
  return () => {
    page.removeEventListener("scroll", onPosition);
    page.removeEventListener("resize", onPosition);
    page.visualViewport?.removeEventListener("resize", onPosition);
    page.visualViewport?.removeEventListener("scroll", onPosition);
  };
}

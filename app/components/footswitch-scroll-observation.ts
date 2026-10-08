export type ScrollPosition = { viewer: number; document: number };

// Passive observation only. Never write scroll positions or cancel browser input.
export function observeScrollPositions(
  page: Window, viewer: HTMLElement, onPosition: (position: ScrollPosition) => void,
) {
  const report = () => onPosition({ viewer: viewer.scrollTop, document: page.scrollY });
  viewer.addEventListener("scroll", report, { passive: true });
  page.addEventListener("scroll", report, { passive: true });
  report();
  return () => {
    viewer.removeEventListener("scroll", report);
    page.removeEventListener("scroll", report);
  };
}

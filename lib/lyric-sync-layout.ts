import type { SemanticLyricPosition } from "./lyric-follow-protocol";

export async function lyricRevision(lyrics: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lyrics))), b => b.toString(16).padStart(2, "0")).join("");
}
const lines = (doc: Document) => Array.from(doc.querySelectorAll<HTMLElement>("#smart-lyric-paging-display [data-lyric-line]"));
const anchor = (line: HTMLElement): SemanticLyricPosition => ({ section: Number(line.dataset.lyricSection), originalLine: Number(line.dataset.lyricLine), characterOffset: Number(line.dataset.lyricOffset) });
const headerBottom = (doc: Document) => doc.querySelector("#smart-lyric-paging-display header")?.getBoundingClientRect().bottom ?? 0;
export function readLyricPosition(doc: Document, page: Window): SemanticLyricPosition | null {
  const top = Math.max(headerBottom(doc), page.visualViewport?.offsetTop ?? 0);
  const bottom = (page.visualViewport?.offsetTop ?? 0) + (page.visualViewport?.height ?? page.innerHeight);
  const line = lines(doc).find(line => { const r = line.getBoundingClientRect(); return r.bottom > top && r.top < bottom; });
  if (!line) return null;
  const position = anchor(line);
  if (line.firstChild?.nodeType === 3 && line.getBoundingClientRect().top < top) {
    const points = Array.from(line.textContent ?? ""), range = doc.createRange();
    let low = 0, high = points.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2), offset = points.slice(0, mid).join("").length;
      range.setStart(line.firstChild, offset); range.setEnd(line.firstChild, offset + points[mid].length);
      if (range.getBoundingClientRect().bottom <= top) low = mid + 1; else high = mid;
    }
    position.characterOffset += Math.min(low, Math.max(0, points.length - 1)); range.detach();
  }
  return position;
}
export function lyricTargetPage(doc: Document, position: SemanticLyricPosition): HTMLElement | null {
  for (const line of lines(doc)) {
    const at = anchor(line), length = Array.from(line.textContent ?? "").length;
    if (at.section === position.section && at.originalLine === position.originalLine && position.characterOffset >= at.characterOffset
      && position.characterOffset < at.characterOffset + Math.max(1, length)) return line.closest<HTMLElement>("[data-smart-lyric-page]");
  }
  return null;
}
// Wedge-only actuator. Main iPad observation never calls this helper.
export function alignWedgeLyrics(doc: Document, page: Window, position: SemanticLyricPosition) {
  const target = lyricTargetPage(doc, position); if (!target) return false;
  const root = doc.scrollingElement;
  const maximum = root ? Math.max(0, root.scrollHeight - root.clientHeight) : Infinity;
  const rotatedTop = target.getAttribute?.("data-wedge-scroll-top");
  const logicalTop = rotatedTop != null && Number.isFinite(Number(rotatedTop)) ? Number(rotatedTop)
    : page.scrollY + target.getBoundingClientRect().top - headerBottom(doc);
  const top = Math.min(maximum, Math.max(0, logicalTop));
  if (Math.abs(page.scrollY - top) > 1) page.scrollTo({ top, behavior: "instant" });
  return true;
}
export function observeSemanticLyrics(doc: Document, page: Window, report: () => void) {
  let frame = 0;
  const schedule = () => { if (!frame) frame = page.requestAnimationFrame(() => { frame = 0; report(); }); };
  const observer = new MutationObserver(schedule); observer.observe(doc.body, { childList: true, subtree: true });
  page.addEventListener("scroll", schedule, { passive: true }); page.addEventListener("resize", schedule, { passive: true });
  page.visualViewport?.addEventListener("resize", schedule, { passive: true }); schedule();
  return () => { observer.disconnect(); page.cancelAnimationFrame(frame); page.removeEventListener("scroll", schedule);
    page.removeEventListener("resize", schedule); page.visualViewport?.removeEventListener("resize", schedule); };
}

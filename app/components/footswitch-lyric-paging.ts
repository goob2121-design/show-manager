export function splitLyricSections(lyrics: string): string[] {
  const sections: string[] = [];
  let lines: string[] = [];
  for (const line of lyrics.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.trim() === "") {
      if (lines.length) sections.push(lines.join("\n"));
      lines = [];
    } else lines.push(line);
  }
  if (lines.length) sections.push(lines.join("\n"));
  return sections;
}

export type LyricPageLine = { text: string; originalLine: number; continued: boolean };
export type LyricPage = { section: number; part: number; fontSize: number; lines: LyricPageLine[]; expanded: boolean };
export type PagingOptions = {
  preferredFontSize: number; minimumFontSize: number; contentHeight: number;
  measureLine: (text: string, fontSize: number) => number;
};

// Pure layout planning: measurements are supplied by the caller, not read from the DOM here.
export function paginateLyricSections(sections: string[], options: PagingOptions): LyricPage[] {
  const { preferredFontSize, minimumFontSize, contentHeight, measureLine } = options;
  if (minimumFontSize <= 0 || preferredFontSize < minimumFontSize || contentHeight <= 0) throw new Error("Invalid lyric page dimensions");
  const pages: LyricPage[] = [];
  sections.forEach((section, sectionIndex) => {
    const originalLines = section.split("\n");
    let fontSize = preferredFontSize;
    while (fontSize > minimumFontSize && originalLines.reduce((sum, text) => sum + measureLine(text, fontSize), 0) > contentHeight) {
      fontSize = Math.max(minimumFontSize, fontSize - 2);
    }
    let current: LyricPage = { section: sectionIndex + 1, part: 1, fontSize, lines: [], expanded: false };
    let used = 0;
    const flush = () => {
      if (!current.lines.length) return;
      pages.push(current);
      current = { ...current, part: current.part + 1, lines: [], expanded: false };
      used = 0;
    };
    const append = (line: LyricPageLine) => {
      const height = measureLine(line.text, fontSize);
      if (used + height > contentHeight) flush();
      current.lines.push(line);
      used += height;
      current.expanded ||= height > contentHeight;
    };
    originalLines.forEach((text, originalLine) => {
      if (measureLine(text, fontSize) <= contentHeight || measureLine("M", fontSize) > contentHeight) {
        append({ text, originalLine, continued: false });
        return;
      }
      // A single extremely long line can span pages. Preserve every character, including
      // spaces/chords, and avoid separating Unicode surrogate pairs. Prefer word boundaries.
      let remaining = Array.from(text);
      let continued = false;
      while (remaining.length) {
        let low = 1, high = remaining.length, fit = 1;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          if (measureLine(remaining.slice(0, middle).join(""), fontSize) <= contentHeight) { fit = middle; low = middle + 1; }
          else high = middle - 1;
        }
        if (fit < remaining.length) {
          for (let index = fit - 1; index >= Math.floor(fit / 2); index--) {
            if (/\s/.test(remaining[index])) { fit = index + 1; break; }
          }
        }
        append({ text: remaining.slice(0, fit).join(""), originalLine, continued });
        remaining = remaining.slice(fit);
        continued = true;
      }
    });
    flush();
  });
  return pages;
}

export function nearestLyricPage(tops: number[], anchor: number) {
  let index = 0;
  for (let candidate = 1; candidate < tops.length; candidate++) {
    if (Math.abs(tops[candidate] - anchor) < Math.abs(tops[index] - anchor)) index = candidate;
  }
  return { index, offset: tops.length ? tops[index] - anchor : 0 };
}

export function calibratedPageHeight(viewportHeight: number, toolbarHeight: number, adjustment: number) {
  const calculated = Math.max(1, viewportHeight - toolbarHeight);
  const calibration = Math.max(-300, Math.min(300, Math.round(adjustment / 5) * 5));
  return { calculated, calibration, effective: Math.max(1, calculated + calibration) };
}

export function measuredLyricAlignment(tops: number[], toolbarBottom: number, scrollPosition: number) {
  const nearest = nearestLyricPage(tops, toolbarBottom);
  return { ...nearest, scrollPosition, boundary: scrollPosition + nearest.offset, error: -nearest.offset };
}

export function calibrationNeedsRetest(before: { height: number; toolbarHeight: number; width: number }, after: { height: number; toolbarHeight: number; width: number }) {
  return Math.abs(before.height - after.height) >= 40 || Math.abs(before.width - after.width) >= 40 || Math.abs(before.toolbarHeight - after.toolbarHeight) >= 40;
}

export function visibleLyricPage(rects: { top: number; bottom: number }[], areaTop: number, areaBottom: number) {
  let index = 0, largestVisible = -1;
  rects.forEach((rect, candidate) => {
    const visible = Math.max(0, Math.min(rect.bottom, areaBottom) - Math.max(rect.top, areaTop));
    if (visible > largestVisible) { largestVisible = visible; index = candidate; }
  });
  return index;
}

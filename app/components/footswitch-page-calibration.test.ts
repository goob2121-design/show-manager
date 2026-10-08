import assert from "node:assert/strict";
import test from "node:test";
const { calibratedPageHeight, measuredLyricAlignment, calibrationNeedsRetest, paginateLyricSections, splitLyricSections } = await import(new URL("./footswitch-lyric-paging.ts", import.meta.url).href) as typeof import("./footswitch-lyric-paging");
const { SMART_PAGING_SAMPLES } = await import(new URL("./footswitch-smart-paging-samples.ts", import.meta.url).href) as typeof import("./footswitch-smart-paging-samples");
const { visibleLyricPage } = await import(new URL("./footswitch-lyric-paging.ts", import.meta.url).href) as typeof import("./footswitch-lyric-paging");

test("page indicator chooses actual visible lyrics across unequal pages, not just the nearest boundary", () => {
  assert.equal(visibleLyricPage([{ top: -200, bottom: 600 }, { top: 600, bottom: 1400 }], 44, 906), 0);
  assert.equal(visibleLyricPage([{ top: -700, bottom: 100 }, { top: 100, bottom: 900 }], 44, 906), 1);
  assert.equal(visibleLyricPage([{ top: 44, bottom: 866 }], 44, 906), 0);
});

test("expanded calibration keeps the same additive formula across -300 through +300 in 5px steps", () => {
  for (let adjustment = -300; adjustment <= 300; adjustment += 5) {
    assert.deepEqual(calibratedPageHeight(900, 120, adjustment), { calculated: 780, calibration: adjustment, effective: 780 + adjustment });
  }
  assert.equal(calibratedPageHeight(900, 120, 500).calibration, 300);
  assert.equal(calibratedPageHeight(900, 120, -500).calibration, -300);
  assert.equal(calibratedPageHeight(900, 120, 26).calibration, 25);
  assert.equal(calibratedPageHeight(900, 120, -125).effective, 655);
  assert.equal(calibratedPageHeight(50, 100, -100).effective, 1, "Very small viewports never yield negative page dimensions");
});

test("signed error uses actual unequal page boundaries and toolbar offset", () => {
  // Actual document page tops are 150, 960, and 1820; their spacing is not assumed.
  const beyond = measuredLyricAlignment([-670, 140, 1000], 150, 820);
  assert.equal(beyond.index, 1);
  assert.equal(beyond.boundary, 810);
  assert.equal(beyond.error, 10, "Positive = scrolled beyond the boundary");
  const before = measuredLyricAlignment([-650, 160, 1020], 150, 800);
  assert.equal(before.boundary, 810);
  assert.equal(before.error, -10, "Negative = stopped short");
  const later = measuredLyricAlignment([-1535, -725, 135], 150, 1685);
  assert.equal(later.index, 2);
  assert.equal(later.boundary, 1670);
  assert.equal(later.error, 15);
});

test("calibration recomputes fitting and preserves all sample characters at both slider extremes", () => {
  for (const sample of Object.values(SMART_PAGING_SAMPLES)) {
    const sections = splitLyricSections(sample);
    for (const adjustment of [-300, -125, -100, 0, 300]) {
      const height = calibratedPageHeight(700, 250, adjustment).effective;
      const measureLine = (text: string, font: number) => Math.max(1, Math.ceil(Array.from(text).length / 28)) * font * 1.4;
      const pages = paginateLyricSections(sections, { preferredFontSize: 48, minimumFontSize: 28, contentHeight: height - 84, measureLine });
      sections.forEach((section, index) => {
        const lines: string[] = [];
        for (const page of pages.filter((page) => page.section === index + 1)) {
          assert.ok(page.expanded || page.lines.reduce((sum, line) => sum + measureLine(line.text, page.fontSize), 0) <= height - 84);
          for (const line of page.lines) lines[line.originalLine] = (lines[line.originalLine] ?? "") + line.text;
        }
        assert.equal(lines.join("\n"), section);
      });
    }
  }
});

test("significant portrait/landscape, chrome, or toolbar changes require retesting", () => {
  const baseline = { height: 900, width: 800, toolbarHeight: 200 };
  assert.equal(calibrationNeedsRetest(baseline, { ...baseline, height: 880 }), false);
  assert.equal(calibrationNeedsRetest(baseline, { ...baseline, height: 850 }), true);
  assert.equal(calibrationNeedsRetest(baseline, { ...baseline, width: 1200 }), true);
  assert.equal(calibrationNeedsRetest(baseline, { ...baseline, toolbarHeight: 250 }), true);
});

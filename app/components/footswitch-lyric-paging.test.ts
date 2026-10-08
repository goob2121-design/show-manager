import assert from "node:assert/strict";
import test from "node:test";
import type { LyricPage } from "./footswitch-lyric-paging";

const { splitLyricSections, paginateLyricSections, nearestLyricPage } = await import(new URL("./footswitch-lyric-paging.ts", import.meta.url).href) as typeof import("./footswitch-lyric-paging");
const { SMART_PAGING_SAMPLES } = await import(new URL("./footswitch-smart-paging-samples.ts", import.meta.url).href) as typeof import("./footswitch-smart-paging-samples");
const measureLine = (text: string, fontSize: number) => Math.max(1, Math.ceil(Array.from(text).length / 30)) * fontSize * 1.4;
const options = { preferredFontSize: 48, minimumFontSize: 28, contentHeight: 420, measureLine };
function reconstruct(pages: LyricPage[], section: number) {
  const lines: string[] = [];
  for (const page of pages.filter((page) => page.section === section)) {
    for (const line of page.lines) lines[line.originalLine] = (lines[line.originalLine] ?? "") + line.text;
  }
  return lines.join("\n");
}

test("blank lines detect unlabeled sections across Windows, Unix, and legacy line endings", () => {
  for (const ending of ["\n", "\r\n", "\r"]) {
    assert.deepEqual(splitLyricSections(["", "Verse", "line one", "line two", "", " \t", "", "Chorus", "sing!", "", ""].join(ending)), ["Verse\nline one\nline two", "Chorus\nsing!"]);
  }
  assert.deepEqual(splitLyricSections("One\nTwo\n\nThree\nFour"), ["One\nTwo", "Three\nFour"]);
  assert.deepEqual(splitLyricSections(" \r\n\t\n"), []);
  assert.deepEqual(splitLyricSections(""), []);
  assert.deepEqual(paginateLyricSections([], options), []);
});

test("preserves exact nonblank lines, labels, spacing, punctuation, capitalization, and chords", () => {
  const original = "[Verse 1]\r\n  [G] Hello, WORLD! [Cadd9]  \r\nDon't change — this.\r\n\r\n[Chorus]\r\n[Am7] Sing / repeat (x2)!";
  const sections = splitLyricSections(original);
  assert.deepEqual(sections, ["[Verse 1]\n  [G] Hello, WORLD! [Cadd9]  \nDon't change — this.", "[Chorus]\n[Am7] Sing / repeat (x2)!"]);
  const pages = paginateLyricSections(sections, options);
  sections.forEach((section, index) => assert.equal(reconstruct(pages, index + 1), section));
  assert.ok(original.includes("\r\n"), "The caller's original string is untouched");
});

test("reduces whole-section text size before splitting and keeps short sections at preferred size", () => {
  const short = paginateLyricSections(["Hello\nWorld"], options);
  assert.equal(short.length, 1);
  assert.equal(short[0].fontSize, 48);
  const medium = paginateLyricSections([Array(8).fill("A line").join("\n")], options);
  assert.equal(medium.length, 1);
  assert.ok(medium[0].fontSize < 48 && medium[0].fontSize >= 28);
  const long = paginateLyricSections([Array(30).fill("A line").join("\n")], options);
  assert.ok(long.length > 1);
  assert.ok(long.every((page) => page.fontSize === 28));
  assert.equal(reconstruct(long, 1), Array(30).fill("A line").join("\n"));
  assert.ok(long.every((page) => page.lines.every((line) => !line.continued)), "Prefer complete original lines");
});

test("splits oversized wrapped lines without dropping spaces, Unicode, or chords", () => {
  const text = "[G] 🎵 Very long words — punctuation!  ".repeat(80);
  const pages = paginateLyricSections([text], options);
  assert.ok(pages.length > 1);
  assert.equal(reconstruct(pages, 1), text);
  for (const page of pages) {
    assert.ok(page.lines.reduce((sum, line) => sum + measureLine(line.text, page.fontSize), 0) <= options.contentHeight);
    assert.ok(!page.lines.some((line) => /[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/.test(line.text)));
  }
});

test("small viewport expands rather than hiding text, and larger height produces fewer pages", () => {
  const section = Array(20).fill("Readable text").join("\n");
  const small = paginateLyricSections([section], { ...options, contentHeight: 200 });
  const large = paginateLyricSections([section], { ...options, contentHeight: 800 });
  assert.ok(small.length > large.length);
  const tiny = paginateLyricSections(["Must remain visible"], { ...options, contentHeight: 5 });
  assert.equal(tiny[0].expanded, true);
  assert.equal(reconstruct(tiny, 1), "Must remain visible");
});

test("realistic sample has requested seven section lengths; stress sample survives every text size", () => {
  const realistic = splitLyricSections(SMART_PAGING_SAMPLES.realistic);
  assert.deepEqual(realistic.map((section) => section.split("\n").length - 1), [4, 4, 6, 4, 4, 8, 4]);
  const sections = splitLyricSections(SMART_PAGING_SAMPLES.overflow);
  for (const preferredFontSize of [40, 48, 56]) {
    const pages = paginateLyricSections(sections, { ...options, preferredFontSize });
    sections.forEach((section, index) => assert.equal(reconstruct(pages, index + 1), section));
  }
});

test("passive page selection reports alignment and gradual boundary drift", () => {
  assert.deepEqual(nearestLyricPage([100, 700, 1300], 100), { index: 0, offset: 0 });
  assert.deepEqual(nearestLyricPage([-520, 80, 680], 100), { index: 1, offset: -20 });
  assert.deepEqual(nearestLyricPage([-490, 110, 710], 100), { index: 1, offset: 10 });
  assert.deepEqual(nearestLyricPage([], 100), { index: 0, offset: 0 });
});

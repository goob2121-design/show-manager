import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/components/band-live-page.tsx", "utf8").replace(/\r\n/g, "\n");

function sourceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("manual lyrics opening with Auto Start on waits for the container, counts down, and starts scrolling", () => {
  const openLyrics = sourceBetween(
    "  const openLyricsModal = () => {",
    "  const clearIntroAutoOpenLyricsTimer = () => {",
  );
  assert.ok(openLyrics.indexOf("setPendingLyricsAutoStart(true)") < openLyrics.indexOf("setLyricsOpen(true)"));

  const pendingEffect = sourceBetween(
    "  useEffect(() => {\n    if (!pendingLyricsAutoStart)",
    "  useEffect(() => {\n    clearIntroAutoOpenLyricsTimer();",
  );
  assert.match(pendingEffect, /currentSong\.lyricsAutoStartScroll \?\? lyricsAutoStartScroll/);
  assert.match(pendingEffect, /const lyricsScrollContainer = lyricsScrollContainerRef\.current/);
  assert.match(pendingEffect, /if \(!lyricsScrollContainer\)/);
  assert.match(pendingEffect, /lyricsAutoScrollSpeedRef\.current = nextSpeed/);
  assert.match(pendingEffect, /lyricsAutoScrollDelayRef\.current = nextDelay/);
  assert.match(pendingEffect, /lyricsScrollContainer\.scrollTop = 0/);
  assert.match(pendingEffect, /startLyricsAutoScroll\(true\)/);

  const startScroll = sourceBetween(
    "  const startLyricsAutoScroll = (useDelay = true) => {",
    "  const openLyricsModal = () => {",
  );
  assert.match(startScroll, /setLyricsAutoScrollStatus\("countdown"\)/);
  assert.match(startScroll, /setLyricsAutoScrollCountdown\(remainingSeconds\)/);
  assert.match(startScroll, /setLyricsAutoScrollStatus\("running"\)/);
});

test("manual lyrics opening with Auto Start off remains stopped and keeps the manual control", () => {
  const pendingEffect = sourceBetween(
    "  useEffect(() => {\n    if (!pendingLyricsAutoStart)",
    "  useEffect(() => {\n    clearIntroAutoOpenLyricsTimer();",
  );
  assert.match(
    pendingEffect,
    /if \(!shouldAutoStart\) \{\s*setPendingLyricsAutoStart\(false\);\s*return;\s*\}/,
  );

  const controls = sourceBetween(
    '      {lyricsOpen && currentSong?.lyrics?.trim() ? (',
    '      {songIntroOpen && isLeaderUnlocked && currentSong?.songIntroNotes ? (',
  );
  assert.match(controls, /startLyricsAutoScroll\(true\)/);
  assert.match(controls, /<span>START AUTO SCROLL<\/span>/);
});

test("intro-driven auto-open still enters the shared pending autostart workflow", () => {
  const introOpen = sourceBetween(
    "  const openLyricsFromSongIntro = () => {",
    "  const markProgrammaticLyricsScroll = () => {",
  );
  assert.match(introOpen, /setPendingLyricsAutoStart\(true\)/);
  assert.match(introOpen, /setSongIntroOpen\(false\)/);
  assert.match(introOpen, /openLyricsModal\(\)/);

  const introTimer = sourceBetween(
    "  useEffect(() => {\n    clearIntroAutoOpenLyricsTimer();",
    "  useEffect(() => {\n    stopLyricsAutoScroll();",
  );
  assert.match(introTimer, /openLyricsFromSongIntro\(\)/);
});


test("Performance View lyrics header avoids overlap and suppresses the duplicate flow-panel control", () => {
  const header = sourceBetween(
    'lyricsControlsHidden ? "grid grid-cols-2 items-center gap-2 text-center"',
    'showLyricsPerformanceFlowPanel ? "md:grid-cols',
  );
  assert.match(header, /lyricsControlsHidden \? "grid grid-cols-2 items-center gap-2 text-center"/);
  assert.match(header, /lyricsControlsHidden \? "contents"/);
  assert.match(header, /order-1 col-span-2 text-4xl/);
  assert.match(header, /order-2 col-span-2/);
  assert.match(header, /!lyricsControlsHidden \|\| !showLyricsPerformanceFlowPanel/);
  assert.equal((source.match(/<span>STOP AUTO SCROLL<\/span>/g) ?? []).length, 2);
  assert.match(header, /order-3 col-span-2/);
  assert.match(header, /order-4 w-full justify-self-end/);
  assert.match(header, /order-4 w-full justify-self-start/);
  assert.doesNotMatch(header, /lyricsControlsHidden \? "absolute right-0 top-0/);

});

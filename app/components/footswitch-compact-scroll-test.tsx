"use client";

import { useEffect, useRef, useState } from "react";
import { observeScrollPositions, type ScrollPosition } from "./footswitch-scroll-observation";

const SIZES = [{ label: "Small", lines: 4 }, { label: "Medium", lines: 6 }, { label: "Large", lines: 10 }];
const LINE_HEIGHT = 48;
const MOCK_PHRASES = ["Morning light", "Another page", "A quiet room", "Let it flow", "A steady rhythm", "Lines waiting here", "A distant sound", "Feet on the ground", "Follow the verse", "One page at a time", "Mark the way", "Fade away"];
const MOCK_LINES = Array.from({ length: 120 }, (_, index) => ({ number: index + 1, text: MOCK_PHRASES[index % MOCK_PHRASES.length] }));

export function CompactLyricScrollTest({ onReturn, onNativeScroll }: { onReturn: () => void; onNativeScroll: () => void }) {
  const viewer = useRef<HTMLDivElement>(null);
  const baseline = useRef<ScrollPosition | null>(null);
  const [visibleLines, setVisibleLines] = useState(6);
  const [movement, setMovement] = useState({ viewer: 0, document: 0 });

  useEffect(() => {
    if (!viewer.current) return;
    return observeScrollPositions(window, viewer.current, (position) => {
      if (!baseline.current) baseline.current = position;
      setMovement({ viewer: position.viewer - baseline.current.viewer, document: position.document - baseline.current.document });
    });
  }, []);

  const buttonClass = "min-h-12 rounded-xl border border-stone-300 bg-white px-4 py-3 font-bold text-stone-800 hover:bg-stone-100 dark:border-white/20 dark:bg-slate-800 dark:text-slate-100";
  return (
    <main className="min-h-screen bg-stone-100 px-4 py-5 text-stone-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <h1 className="text-3xl font-black">Compact Lyric Scroll Test</h1>
          <p className="mt-3 font-bold text-emerald-700 dark:text-emerald-300">Native container scrolling · Keyboard/pointer diagnostic OFF</p>
          <p className="mt-3 text-lg">Set the Speedy to Page Up / Page Down. Try a pedal press, then tap inside the bordered viewer and try again. Tapping focuses the viewer but may not make Safari send native commands into it.</p>
          <p className="mt-2">Compare the numbered lines and movement readouts. Try finger scrolling inside and outside the viewer as a baseline. At either end, Safari may scroll the page instead.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className={buttonClass} onClick={onReturn}>Keyboard/Pointer Diagnostic</button>
            <button type="button" className={buttonClass} onClick={onNativeScroll}>Native Scroll Test</button>
          </div>
        </header>

        <section className="sticky top-0 z-10 rounded-2xl border border-stone-300 bg-white p-3 shadow-sm dark:border-white/20 dark:bg-slate-900" aria-label="Scroll movement readouts">
          <p className="font-bold">Movement since opening this experiment (net pixels)</p>
          <div className="mt-2 grid grid-cols-2 gap-3 font-mono text-lg font-black sm:text-2xl">
            <p>Lyric viewer: {Math.round(movement.viewer)} px</p><p>Main document: {Math.round(movement.document)} px</p>
          </div>
          <p className="mt-2 text-sm">Readouts only observe scrolling. Finger gestures and resizing can also change these values.</p>
        </section>

        <section aria-labelledby="compact-lyric-viewer-heading">
          <h2 id="compact-lyric-viewer-heading" className="mb-3 text-2xl font-black">Compact Lyric Viewer · {visibleLines} visible lines</h2>
          <div className="mb-3 flex flex-wrap gap-3" aria-label="Lyric viewer height">
            {SIZES.map((size) => <button key={size.label} type="button" aria-pressed={visibleLines === size.lines} className={`${buttonClass} ${visibleLines === size.lines ? "ring-2 ring-emerald-500" : ""}`} onClick={() => setVisibleLines(size.lines)}>{size.label} · {size.lines} lines</button>)}
          </div>
          <p className="mb-3 text-sm">The viewer stays mounted when resized. Near the end, the browser may adjust the position to fit the new height.</p>
          <div ref={viewer} tabIndex={0} aria-label="Scrollable mock lyric viewer" onPointerDown={() => viewer.current?.focus({ preventScroll: true })} className="overflow-y-auto rounded-2xl border-4 border-emerald-600 bg-white px-3 outline-offset-4 focus:outline-2 focus:outline-emerald-400 dark:bg-slate-900" style={{ height: visibleLines * LINE_HEIGHT + 8 }}>
            <ol className="m-0 p-0 text-[26px] font-semibold">
              {MOCK_LINES.map((line) => <li key={line.number} className="flex items-center gap-3 whitespace-nowrap" style={{ height: LINE_HEIGHT, lineHeight: `${LINE_HEIGHT}px` }}><span className="font-mono text-lg text-stone-500 dark:text-slate-400">{String(line.number).padStart(3, "0")}</span><span>{line.text}</span></li>)}
            </ol>
          </div>
        </section>

        <section aria-labelledby="outside-lyric-viewer-heading" className="rounded-3xl border-2 border-dashed border-stone-400 bg-stone-200 p-5 dark:border-slate-500 dark:bg-slate-800">
          <h2 id="outside-lyric-viewer-heading" className="text-2xl font-black">Outside Lyric Viewer</h2>
          <p className="mt-3 text-lg">This content belongs to the main webpage. If this section moves past the screen while the lyric numbers stay unchanged, the page is scrolling.</p>
          <p className="mt-3">If lyric numbers change inside a stationary border, the compact viewer is scrolling. If neither readout changes, no scrolling was observed.</p>
          {Array.from({ length: 8 }, (_, index) => <p key={index} className="my-10 text-2xl font-bold">Outside marker {index + 1} · Main document content</p>)}
        </section>
        <footer className="flex flex-wrap gap-3 py-6">
          <button type="button" className={buttonClass} onClick={onReturn}>Keyboard/Pointer Diagnostic</button>
          <button type="button" className={buttonClass} onClick={onNativeScroll}>Native Scroll Test</button>
        </footer>
      </div>
    </main>
  );
}

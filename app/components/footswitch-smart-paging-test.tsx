"use client";

import { useEffect, useRef, useState } from "react";
import { calibratedPageHeight, calibrationNeedsRetest, measuredLyricAlignment, paginateLyricSections, splitLyricSections, type LyricPage } from "./footswitch-lyric-paging";
import { observeLyricPagePosition, observePagingViewport, type PagingViewport } from "./footswitch-smart-paging-observers";
import { SMART_PAGING_SAMPLES } from "./footswitch-smart-paging-samples";
import { alignmentStatus, applyDocumentSnap, DOCUMENT_SNAP_MODES } from "./footswitch-document-snap";

const TEXT_SIZES = [{ label: "Large", pixels: 40 }, { label: "Extra Large", pixels: 48 }, { label: "Maximum", pixels: 56 }];

export function SmartLyricPagingTest({ onReturn }: { onReturn: () => void }) {
  const toolbar = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [sample, setSample] = useState<keyof typeof SMART_PAGING_SAMPLES>("realistic");
  const [preferredSize, setPreferredSize] = useState(48);
  const [calibration, setCalibration] = useState(0);
  const viewportBaseline = useRef<PagingViewport | null>(null);
  const latestViewport = useRef<PagingViewport | null>(null);
  const [viewportWarning, setViewportWarning] = useState(false);
  const [layout, setLayout] = useState<{ pageHeight: number; calculatedHeight: number; toolbarHeight: number; viewportHeight: number; documentHeight: number; pages: LyricPage[] }>({ pageHeight: 0, calculatedHeight: 0, toolbarHeight: 0, viewportHeight: 0, documentHeight: 0, pages: [] });
  const [position, setPosition] = useState({ index: 0, offset: 0, scrollPosition: 0, boundary: 0, error: 0 });

  useEffect(() => {
    if (!toolbar.current || !rail.current || !probe.current) return;
    return observePagingViewport(window, toolbar.current, rail.current, (viewport) => {
      const measurement = probe.current;
      if (!measurement) return;
      latestViewport.current = viewport;
      if (!viewportBaseline.current) viewportBaseline.current = viewport;
      else if (calibrationNeedsRetest(viewportBaseline.current, viewport)) setViewportWarning(true);
      // Page border + padding = 52px; the per-page diagnostic label occupies 32px.
      const heights = calibratedPageHeight(viewport.height, viewport.toolbarHeight, calibration);
      const pageHeight = heights.effective;
      measurement.style.width = `${Math.max(1, viewport.width - 52)}px`;
      const pages = paginateLyricSections(splitLyricSections(SMART_PAGING_SAMPLES[sample]), {
        preferredFontSize: preferredSize, minimumFontSize: 28, contentHeight: Math.max(1, pageHeight - 84),
        measureLine: (text, fontSize) => {
          measurement.style.fontSize = `${fontSize}px`;
          measurement.textContent = text;
          return measurement.getBoundingClientRect().height;
        },
      });
      setLayout({ pageHeight, calculatedHeight: heights.calculated, toolbarHeight: viewport.toolbarHeight, viewportHeight: viewport.height, documentHeight: document.scrollingElement?.clientHeight ?? window.innerHeight, pages });
    });
  }, [sample, preferredSize, calibration]);

  // Calibration uses native scrolling only, even at 0px. Restore the original document
  // styles on exit; the prior snap experiment cannot be activated in this view.
  useEffect(() => applyDocumentSnap(document, "off", 0), []);

  useEffect(() => observeLyricPagePosition(window, () => {
    const tops = Array.from(rail.current?.querySelectorAll<HTMLElement>("[data-smart-lyric-page]") ?? []).map((page) => page.getBoundingClientRect().top);
    const next = measuredLyricAlignment(tops, toolbar.current?.getBoundingClientRect().bottom ?? 0, window.scrollY);
    setPosition((previous) => previous.index === next.index && Math.abs(previous.offset - next.offset) < 0.5 ? previous : next);
  }), [layout, viewportWarning]);

  const buttonClass = "min-h-11 rounded-xl border border-stone-300 bg-white px-3 py-2 font-bold text-stone-800 dark:border-white/20 dark:bg-slate-800 dark:text-slate-100";
  return (
    <main className="relative min-h-screen bg-stone-100 text-stone-950 dark:bg-slate-950 dark:text-slate-100">
      <header ref={toolbar} className="sticky top-0 z-10 border-b border-stone-300 bg-white p-3 dark:border-white/20 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-black">Smart Lyric Paging Test</h1>
          <button type="button" className={buttonClass} onClick={onReturn}>Back to Footswitch Test</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="font-bold">Sample <select value={sample} onChange={(event) => setSample(event.target.value as keyof typeof SMART_PAGING_SAMPLES)} className="rounded-xl border border-stone-300 bg-white p-2 dark:border-white/20 dark:bg-slate-800"><option value="realistic">Realistic song</option><option value="overflow">Long lines / overflow</option></select></label>
          {TEXT_SIZES.map((size) => <button key={size.label} type="button" aria-pressed={preferredSize === size.pixels} className={`${buttonClass} ${preferredSize === size.pixels ? "ring-2 ring-emerald-500" : ""}`} onClick={() => setPreferredSize(size.pixels)}>{size.label}</button>)}
        </div>
        <label className="mt-2 flex flex-wrap items-center gap-2 font-bold">Experimental Scroll Alignment
          <select value="off" disabled aria-label="Scroll Alignment — OFF required during calibration" className="rounded-xl border border-stone-300 bg-white p-2 dark:border-white/20 dark:bg-slate-800">
            {DOCUMENT_SNAP_MODES.map((mode) => <option key={mode.value} value={mode.value} disabled={mode.value !== "off"}>{mode.label}</option>)}
          </select>
          <span className="text-sm">Calibration requires OFF.</span>
        </label>
        <div className="mt-2">
          <label htmlFor="footswitch-page-height-calibration" className="font-bold">Footswitch Page Height Calibration</label>
          <div className="flex flex-wrap items-center gap-3">
            <span>-100px</span><input id="footswitch-page-height-calibration" type="range" min={-100} max={100} step={10} value={calibration} onChange={(event) => setCalibration(Number(event.target.value))} className="min-h-10 min-w-40 flex-1 accent-emerald-600" /><span>+100px</span>
            <output htmlFor="footswitch-page-height-calibration" className="font-mono font-bold">Current Adjustment: {calibration > 0 ? "+" : ""}{calibration}px</output>
            <button type="button" className={buttonClass} onClick={() => setCalibration(0)}>Reset to 0</button>
          </div>
        </div>
        <p className="mt-1 text-sm">Native document scrolling · Diagnostic listeners OFF · Snapping forced OFF. Changing calibration may require touch-scrolling back to the sample beginning.</p>
        <section aria-label="Page height calibration diagnostics" className="mt-1 grid gap-x-4 font-mono text-sm sm:grid-cols-2">
          <p className="font-bold">{layout.pages.length ? `Page ${position.index + 1} of ${layout.pages.length} · ${alignmentStatus(position.error)}` : "Measuring available space…"}</p>
          <p>Calculated Height: {Math.round(layout.calculatedHeight)}px</p>
          <p>Calibration: {calibration > 0 ? "+" : ""}{calibration}px · Effective Height: {Math.round(layout.pageHeight)}px</p>
          <p>Current Scroll Position: {Math.round(position.scrollPosition)}px</p>
          <p>Expected Page Boundary: {Math.round(position.boundary)}px</p>
          <p>Alignment Error: {position.error > 0 ? "+" : ""}{Math.round(position.error)}px · Boundary offset: {Math.round(position.offset)} px</p>
        </section>
        <p className="mt-1 text-xs">Positive error = past the boundary; negative = before it. Heights include page borders and padding. Actual rendered boundaries are measured.</p>
        {viewportWarning && <p role="status" className="mt-1 text-sm font-bold text-amber-700 dark:text-amber-300">Viewport changed — retest calibration.</p>}
        <p className="mt-1 font-mono text-xs">Visual viewport: {Math.round(layout.viewportHeight)}px · Document viewport: {Math.round(layout.documentHeight)}px · Toolbar: {Math.round(layout.toolbarHeight)}px · Page: {Math.round(layout.pageHeight)}px. Chrome changes can reflow pages.</p>
      </header>

      <section className="border-b border-stone-300 bg-white p-5 dark:border-white/20 dark:bg-slate-900" aria-labelledby="footswitch-calibration-guide">
        <h2 id="footswitch-calibration-guide" className="text-xl font-black">How to Calibrate</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-6">
          <li>Set font size to Extra Large.</li><li>Keep Scroll Alignment OFF.</li><li>Set Page Height Calibration to 0.</li>
          <li>Use normal touch scrolling to return to the first lyric page, with its top boundary just below the toolbar.</li>
          <li>Press Page Down three times.</li><li>Observe whether alignment error becomes positive or negative.</li>
          <li>If Safari moves too far, increase page height.</li><li>If Safari does not move far enough, decrease page height.</li>
          <li>Touch-scroll back to the first lyric page and repeat until several presses stay close to boundaries.</li>
        </ol>
        <p className="mt-3 font-bold">After resizing, changing font/sample, or adjusting calibration, return to the sample beginning before retesting. One value may not work across devices or orientations. No automatic repositioning occurs.</p>
        {viewportWarning && <div role="status" className="mt-3 rounded-xl bg-amber-100 p-3 text-amber-950">
          <p>Viewport or toolbar size changed significantly. Retest calibration in this orientation and with Safari&apos;s current toolbar position.</p>
          <button type="button" className={`${buttonClass} mt-2`} onClick={() => { viewportBaseline.current = latestViewport.current; setViewportWarning(false); }}>Acknowledge viewport change</button>
        </div>}
      </section>

      <div ref={probe} aria-hidden="true" className="pointer-events-none invisible fixed left-0 top-0 whitespace-pre-wrap break-words font-semibold [overflow-wrap:anywhere]" style={{ lineHeight: 1.4 }} />
      <div ref={rail}>
        {layout.pages.map((page, index) => <section key={`${page.section}-${page.part}`} data-smart-lyric-page className="m-0 box-border flex flex-col border-2 border-dashed border-emerald-500/60 p-6 odd:bg-white dark:odd:bg-slate-900" style={{ minHeight: layout.pageHeight, scrollSnapAlign: "none", scrollMarginTop: 0 }} aria-label={`Lyric page ${index + 1}`}>
          <p className="mb-3 text-sm font-bold text-emerald-800 dark:text-emerald-300" style={{ lineHeight: "20px" }}>Page {index + 1} · Section {page.section}{page.part > 1 ? ` · continued (${page.part})` : ""} · {page.fontSize}px{page.expanded ? " · Expanded to preserve text" : ""}</p>
          <div className="flex flex-1 flex-col justify-center text-left font-semibold" style={{ fontSize: page.fontSize, lineHeight: 1.4 }}>
            {page.lines.map((line, lineIndex) => <div key={lineIndex} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{line.text}</div>)}
          </div>
        </section>)}
      </div>
    </main>
  );
}

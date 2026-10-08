"use client";

import { useEffect, useRef, useState } from "react";
import { calibratedPageHeight, calibrationNeedsRetest, measuredLyricAlignment, paginateLyricSections, splitLyricSections, visibleLyricPage, type LyricPage } from "./footswitch-lyric-paging";
import { observeLyricPagePosition, observePagingViewport, type PagingViewport } from "./footswitch-smart-paging-observers";
import { SMART_PAGING_SAMPLES } from "./footswitch-smart-paging-samples";

export type SmartPagingConfig = { sample: keyof typeof SMART_PAGING_SAMPLES; preferredSize: number; calibration: number; source?: "sample" | "stageflow"; songId?: string; title?: string; orientation?: "portrait" | "landscape"; fullscreen?: boolean };
export type DisplayLayout = { pageHeight: number; calculatedHeight: number; appliedCalibration: number; controlsHeight: number; viewportHeight: number; documentHeight: number; viewportChanged: boolean; pages: LyricPage[] };
export type PagingMeasurement = { timestamp: string; config: SmartPagingConfig; layout: Omit<DisplayLayout, "pages">; pageCount: number; visiblePage: number; alignment: ReturnType<typeof measuredLyricAlignment> };

export function SmartLyricPagingDisplay({ config, lyricText = SMART_PAGING_SAMPLES[config.sample], fullscreenLabel, onCalibrate, onReturn, onMeasurement }: { config: SmartPagingConfig; lyricText?: string; fullscreenLabel?: string; onCalibrate?: () => void; onReturn: () => void; onMeasurement: (measurement: PagingMeasurement) => void }) {
  const controls = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const viewportBaseline = useRef<PagingViewport | null>(null);
  const [layout, setLayout] = useState<DisplayLayout | null>(null);
  const [visiblePage, setVisiblePage] = useState(0);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debug, setDebug] = useState<{ fullscreen: boolean; orientation: string; requestedSize: number; renderedSize: string | null; calibration: number; appliedCalibration: number; viewportHeight: number; calculatedHeight: number; targetHeight: number; renderedHeight: number; cssMinHeight: string | null; scrollY: number; page: number } | null>(null);

  useEffect(() => {
    if (!controls.current || !rail.current || !probe.current) return;
    return observePagingViewport(window, controls.current, rail.current, (viewport) => {
      const measurement = probe.current;
      if (!measurement) return;
      if (!viewportBaseline.current) viewportBaseline.current = viewport;
      const heights = calibratedPageHeight(viewport.height, viewport.toolbarHeight, config.calibration);
      // Border-box padding/borders consume 52px; there is no per-page diagnostic label.
      measurement.style.width = `${Math.max(1, viewport.width - 52)}px`;
      const pages = paginateLyricSections(splitLyricSections(lyricText), {
        preferredFontSize: config.preferredSize, minimumFontSize: 28, contentHeight: Math.max(1, heights.effective - 52),
        measureLine: (text, fontSize) => {
          measurement.style.fontSize = `${fontSize}px`;
          measurement.textContent = text;
          return measurement.getBoundingClientRect().height;
        },
      });
      setLayout({ pageHeight: heights.effective, calculatedHeight: heights.calculated, appliedCalibration: heights.calibration, controlsHeight: viewport.toolbarHeight,
        viewportHeight: viewport.height, documentHeight: document.scrollingElement?.clientHeight ?? window.innerHeight,
        viewportChanged: calibrationNeedsRetest(viewportBaseline.current, viewport), pages });
    });
  }, [lyricText, config.preferredSize, config.calibration]);

  useEffect(() => observeLyricPagePosition(window, () => {
    // Refs become null on unmount; never replace saved results with setup geometry.
    if (!layout || !rail.current || !controls.current) return;
    const elements = Array.from(rail.current.querySelectorAll<HTMLElement>("[data-smart-lyric-page]"));
    const rects = elements.map((page) => page.getBoundingClientRect());
    if (!rects.length) return;
    const top = Math.max(controls.current.getBoundingClientRect().bottom, window.visualViewport?.offsetTop ?? 0);
    const bottom = (window.visualViewport?.offsetTop ?? 0) + (window.visualViewport?.height ?? window.innerHeight);
    const index = visibleLyricPage(rects, top, bottom);
    setVisiblePage(index);
    const style = typeof window.getComputedStyle === "function" ? window.getComputedStyle(elements[index]) : null;
    setDebug({ fullscreen: Boolean(document.documentElement && document.fullscreenElement === document.documentElement),
      orientation: typeof window.matchMedia === "function" ? window.matchMedia("(orientation: landscape)").matches ? "Landscape" : "Portrait" : config.orientation ?? "Unknown",
      requestedSize: config.preferredSize, renderedSize: style?.fontSize ?? null, calibration: config.calibration,
      appliedCalibration: layout.appliedCalibration, viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      calculatedHeight: layout.calculatedHeight, targetHeight: layout.pageHeight, renderedHeight: rects[index].height,
      cssMinHeight: style?.minHeight ?? null, scrollY: window.scrollY, page: index + 1 });
    const { pages, ...dimensions } = layout;
    onMeasurement({ timestamp: new Date().toISOString(), config: { ...config }, layout: dimensions, pageCount: pages.length,
      visiblePage: index + 1, alignment: measuredLyricAlignment(rects.map((rect) => rect.top), top, window.scrollY) });
  }), [layout, config, onMeasurement]);

  return (
    <main id="smart-lyric-paging-display" aria-label="Full-screen lyric test" className="relative min-h-screen bg-stone-100 text-stone-950 dark:bg-slate-950 dark:text-slate-100">
      {/* Keep the original bar's exact flow footprint and sticky measurement.
          The fixed header replaces its appearance, not its paging geometry. */}
      <div ref={controls} aria-hidden="true" className="pointer-events-none invisible sticky top-0 flex items-center justify-between gap-3 border-b border-stone-300 px-3 py-1">
        <span className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-bold">Back to Setup</span>
        <span className="text-sm font-bold">Page {layout ? visiblePage + 1 : 0} of {layout?.pages.length ?? 0}</span>
      </div>
      {/* The existing Safari viewport excludes vertical unsafe areas (no viewport-fit: cover).
          Equal side gutters also protect landscape insets without offsetting the title. */}
      <header aria-label="Lyric test controls" className="pointer-events-none fixed inset-x-0 top-0 z-20 grid grid-cols-[9rem_minmax(0,1fr)_9rem] items-center border-b border-white/15 bg-[#080808] text-white"
        style={{ height: layout?.controlsHeight ?? 47, paddingInline: "max(12px, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))" }}>
        {onCalibrate ? <div className={config.fullscreen ? "min-w-0 pl-16" : "min-w-0"}>
          {/* Safari owns the upper-left fullscreen exit control. Reserve 64px
              inside the existing header without changing its height or flow. */}
          <a href="#smart-lyric-paging-setup" onClick={onCalibrate} aria-label={config.fullscreen ? "Open calibration setup while staying fullscreen" : "Open calibration setup"} className="pointer-events-auto flex min-h-11 min-w-11 flex-col items-center justify-center rounded-lg border border-white/25 bg-white/10 px-1 text-xs font-bold text-white"><span className="block truncate text-[10px] font-normal">Page {layout ? visiblePage + 1 : 0} of {layout?.pages.length ?? 0}</span><span>Calibrate</span></a>
        </div>
          : <div className="min-w-0 text-xs text-white/70"><span className="block truncate">Page {layout ? visiblePage + 1 : 0} of {layout?.pages.length ?? 0}</span>{fullscreenLabel && <span role="status" title={fullscreenLabel} className="block truncate text-[10px]">{fullscreenLabel}</span>}</div>}
        <h1 title={config.title || "Lyric Test"} className="min-w-0 truncate text-center font-bold uppercase tracking-wide" style={{ fontSize: "clamp(18px, 3.5vw, 26px)", lineHeight: "32px" }}><button type="button" aria-label="Toggle lyric calibration diagnostics" aria-expanded={debugOpen} aria-controls="footswitch-runtime-diagnostics" onClick={() => setDebugOpen((value) => !value)} className="pointer-events-auto flex min-h-11 w-full min-w-0 items-center justify-center"><span className="truncate">{config.title || "Lyric Test"}</span></button></h1>
        <button type="button" onClick={onReturn} aria-label="Close lyric test and return to setup" className="pointer-events-auto flex min-h-11 items-center justify-end gap-1 rounded-lg px-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-white"><span aria-hidden="true">×</span> Close</button>
      </header>
      {debugOpen && <aside id="footswitch-runtime-diagnostics" aria-label="Runtime lyric calibration diagnostics" className="pointer-events-none fixed inset-x-3 bottom-3 z-30 mx-auto max-w-xl rounded-lg border border-white/25 bg-black/90 p-3 text-xs text-white" style={{ bottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex items-center justify-between"><strong>Runtime calibration · tap title to hide</strong><button type="button" className="pointer-events-auto min-h-11 px-2 font-bold" aria-label="Hide calibration diagnostics" onClick={() => setDebugOpen(false)}>Hide</button></div>
        {!debug ? <p>Waiting for rendered page measurements…</p> : <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
          <div><dt>Actual mode / orientation</dt><dd>{debug.fullscreen ? "Fullscreen" : "Regular Safari"} / {debug.orientation}</dd></div>
          <div><dt>Requested / rendered font</dt><dd>{debug.requestedSize === 56 ? "Maximum" : debug.requestedSize === 48 ? "Extra Large" : "Large"} ({debug.requestedSize}px) / {debug.renderedSize ?? "Unavailable"}</dd></div>
          <div><dt>Requested / applied calibration</dt><dd>{debug.calibration}px / {debug.appliedCalibration}px</dd></div>
          <div><dt>Measured viewport height</dt><dd>{debug.viewportHeight.toFixed(1)}px</dd></div>
          <div><dt>Base / calibrated page height</dt><dd>{debug.calculatedHeight.toFixed(1)}px / {debug.targetHeight.toFixed(1)}px</dd></div>
          <div><dt>Rendered page {debug.page} / CSS min-height</dt><dd>{debug.renderedHeight.toFixed(1)}px / {debug.cssMinHeight ?? "Unavailable"}</dd></div>
          <div><dt>Document scrollY</dt><dd>{debug.scrollY.toFixed(1)}px</dd></div>
        </dl>}
        <p className="mt-2 text-white/70">This overlay may cover lyrics while open. Hide it for pedal testing. Page min-height allows content to expand; the formula retains its 1px safety floor.</p>
      </aside>}
      <div ref={probe} aria-hidden="true" className="pointer-events-none invisible fixed left-0 top-0 whitespace-pre-wrap break-words font-semibold [overflow-wrap:anywhere]" style={{ lineHeight: 1.4 }} />
      <div ref={rail}>
        {layout?.pages.map((page, index) => <section key={`${page.section}-${page.part}`} data-smart-lyric-page aria-label={`Lyric page ${index + 1}`} className="m-0 box-border flex flex-col justify-center border-2 border-emerald-500/20 p-6 text-left font-semibold" style={{ minHeight: layout.pageHeight, fontSize: page.fontSize, lineHeight: 1.4, scrollSnapAlign: "none" }}>
          {page.lines.map((line, lineIndex) => <div key={lineIndex} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{line.text}</div>)}
        </section>)}
      </div>
    </main>
  );
}

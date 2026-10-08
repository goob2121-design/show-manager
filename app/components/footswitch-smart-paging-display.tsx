"use client";

import { useEffect, useRef, useState } from "react";
import { calibratedPageHeight, calibrationNeedsRetest, measuredLyricAlignment, paginateLyricSections, splitLyricSections, visibleLyricPage, type LyricPage } from "./footswitch-lyric-paging";
import { observeLyricPagePosition, observePagingViewport, type PagingViewport } from "./footswitch-smart-paging-observers";
import { SMART_PAGING_SAMPLES } from "./footswitch-smart-paging-samples";

export type SmartPagingConfig = { sample: keyof typeof SMART_PAGING_SAMPLES; preferredSize: number; calibration: number; source?: "sample" | "stageflow"; songId?: string; title?: string; orientation?: "portrait" | "landscape" };
export type DisplayLayout = { pageHeight: number; calculatedHeight: number; controlsHeight: number; viewportHeight: number; documentHeight: number; viewportChanged: boolean; pages: LyricPage[] };
export type PagingMeasurement = { timestamp: string; config: SmartPagingConfig; layout: Omit<DisplayLayout, "pages">; pageCount: number; visiblePage: number; alignment: ReturnType<typeof measuredLyricAlignment> };

export function SmartLyricPagingDisplay({ config, lyricText = SMART_PAGING_SAMPLES[config.sample], onReturn, onMeasurement }: { config: SmartPagingConfig; lyricText?: string; onReturn: () => void; onMeasurement: (measurement: PagingMeasurement) => void }) {
  const controls = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const viewportBaseline = useRef<PagingViewport | null>(null);
  const [layout, setLayout] = useState<DisplayLayout | null>(null);
  const [visiblePage, setVisiblePage] = useState(0);

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
      setLayout({ pageHeight: heights.effective, calculatedHeight: heights.calculated, controlsHeight: viewport.toolbarHeight,
        viewportHeight: viewport.height, documentHeight: document.scrollingElement?.clientHeight ?? window.innerHeight,
        viewportChanged: calibrationNeedsRetest(viewportBaseline.current, viewport), pages });
    });
  }, [lyricText, config.preferredSize, config.calibration]);

  useEffect(() => observeLyricPagePosition(window, () => {
    // Refs become null on unmount; never replace saved results with setup geometry.
    if (!layout || !rail.current || !controls.current) return;
    const rects = Array.from(rail.current.querySelectorAll<HTMLElement>("[data-smart-lyric-page]")).map((page) => page.getBoundingClientRect());
    if (!rects.length) return;
    const top = Math.max(controls.current.getBoundingClientRect().bottom, window.visualViewport?.offsetTop ?? 0);
    const bottom = (window.visualViewport?.offsetTop ?? 0) + (window.visualViewport?.height ?? window.innerHeight);
    const index = visibleLyricPage(rects, top, bottom);
    setVisiblePage(index);
    const { pages, ...dimensions } = layout;
    onMeasurement({ timestamp: new Date().toISOString(), config: { ...config }, layout: dimensions, pageCount: pages.length,
      visiblePage: index + 1, alignment: measuredLyricAlignment(rects.map((rect) => rect.top), top, window.scrollY) });
  }), [layout, config, onMeasurement]);

  return (
    <main id="smart-lyric-paging-display" aria-label="Full-screen lyric test" className="relative min-h-screen bg-stone-100 text-stone-950 dark:bg-slate-950 dark:text-slate-100">
      <nav ref={controls} aria-label="Lyric test controls" className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-300 bg-white px-3 py-1 dark:border-white/20 dark:bg-slate-900">
        <a href="#smart-lyric-paging-setup" onClick={onReturn} className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-bold dark:border-white/20">Back to Setup</a>
        <span className="text-sm font-bold">Page {layout ? visiblePage + 1 : 0} of {layout?.pages.length ?? 0}</span>
      </nav>
      <div ref={probe} aria-hidden="true" className="pointer-events-none invisible fixed left-0 top-0 whitespace-pre-wrap break-words font-semibold [overflow-wrap:anywhere]" style={{ lineHeight: 1.4 }} />
      <div ref={rail}>
        {layout?.pages.map((page, index) => <section key={`${page.section}-${page.part}`} data-smart-lyric-page aria-label={`Lyric page ${index + 1}`} className="m-0 box-border flex flex-col justify-center border-2 border-emerald-500/20 p-6 text-left font-semibold" style={{ minHeight: layout.pageHeight, fontSize: page.fontSize, lineHeight: 1.4, scrollSnapAlign: "none" }}>
          {page.lines.map((line, lineIndex) => <div key={lineIndex} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{line.text}</div>)}
        </section>)}
      </div>
    </main>
  );
}

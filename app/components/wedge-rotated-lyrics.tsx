"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { calibratedPageHeight, lyricLineAnchors, measuredLyricAlignment, paginateLyricSections, splitLyricSections, visibleLyricPage, type LyricPage } from "./footswitch-lyric-paging";
import type { PagingMeasurement, SmartPagingConfig } from "./footswitch-smart-paging-display";
import type { WedgeRotation } from "./lyric-wedge-settings";

type Viewport = { width: number; height: number; left: number; top: number; documentHeight: number };
type Layout = { pages: LyricPage[]; headerHeight: number; pageHeight: number; calculated: number; calibration: number };

export function WedgeRotatedLyrics({ config, lyricText, rotation, onReturn, onCalibrate, onMeasurement }: {
  config: SmartPagingConfig; lyricText: string; rotation: Exclude<WedgeRotation, "normal">;
  onReturn: () => void; onCalibrate: () => void; onMeasurement: (measurement: PagingMeasurement) => void;
}) {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const header = useRef<HTMLElement>(null), probe = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null);
  const lineSpacing = config.lineSpacing ?? 1.4;

  useLayoutEffect(() => {
    const measure = () => {
      const visual = window.visualViewport;
      const next = { width: visual?.width ?? window.innerWidth, height: visual?.height ?? window.innerHeight,
        left: visual?.offsetLeft ?? 0, top: visual?.offsetTop ?? 0, documentHeight: document.documentElement.clientHeight };
      setViewport(previous => previous && Object.keys(next).every(key => previous[key as keyof Viewport] === next[key as keyof Viewport]) ? previous : next);
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    window.visualViewport?.addEventListener("resize", measure, { passive: true });
    window.visualViewport?.addEventListener("scroll", measure, { passive: true });
    document.addEventListener("fullscreenchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      document.removeEventListener("fullscreenchange", measure);
    };
  }, []);

  useLayoutEffect(() => {
    if (!viewport || !header.current || !probe.current) return;
    const measure = () => {
      if (!header.current || !probe.current) return;
      const headerHeight = header.current.offsetHeight;
      const heights = calibratedPageHeight(viewport.width, headerHeight, config.calibration);
      const measurement = probe.current;
      measurement.style.width = `${Math.max(1, viewport.height - 52)}px`;
      measurement.style.lineHeight = String(lineSpacing);
      const pages = paginateLyricSections(splitLyricSections(lyricText), {
        preferredFontSize: config.preferredSize, minimumFontSize: Math.min(28, config.preferredSize),
        contentHeight: Math.max(1, heights.effective - 52),
        measureLine: (text, size) => { measurement.style.fontSize = `${size}px`; measurement.textContent = text; return measurement.getBoundingClientRect().height; },
      });
      setLayout({ pages, headerHeight, pageHeight: heights.effective, calculated: heights.calculated, calibration: heights.calibration });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header.current);
    return () => observer.disconnect();
  }, [viewport, lyricText, config.preferredSize, config.calibration, lineSpacing]);

  useLayoutEffect(() => {
    if (!viewport || !layout || !track.current) return;
    let frame = 0;
    const sample = () => {
      frame = 0;
      const rail = track.current;
      if (!rail) return;
      const pages = Array.from(rail.querySelectorAll<HTMLElement>("[data-smart-lyric-page]"));
      const height = rail.scrollHeight, visibleHeight = Math.max(1, viewport.width - layout.headerHeight);
      setContentHeight(height);
      const scroll = Math.max(0, Math.min(window.scrollY, Math.max(0, height - visibleHeight)));
      rail.style.transform = `translateY(${-scroll}px)`;
      // Logical offsets keep the existing wedge-only sync actuator independent of rotation.
      pages.forEach(page => page.setAttribute("data-wedge-scroll-top", String(page.offsetTop)));
      const rects = pages.map(page => ({ top: page.offsetTop - scroll, bottom: page.offsetTop + page.offsetHeight - scroll }));
      const index = visibleLyricPage(rects, 0, visibleHeight);
      setPageNumber(index + 1);
      onMeasurement({ timestamp: new Date().toISOString(), config, pageCount: pages.length, visiblePage: index + 1,
        layout: { pageHeight: layout.pageHeight, calculatedHeight: layout.calculated, appliedCalibration: layout.calibration,
          controlsHeight: layout.headerHeight, viewportHeight: viewport.width, documentHeight: viewport.documentHeight, viewportChanged: false },
        alignment: measuredLyricAlignment(rects.map(rect => rect.top), 0, scroll) });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(sample); };
    sample();
    const observer = new ResizeObserver(schedule);
    observer.observe(track.current);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener("scroll", schedule); window.cancelAnimationFrame(frame); };
  }, [viewport, layout, config, onMeasurement]);

  const anchors = lyricLineAnchors(layout?.pages ?? []);
  const visibleHeight = viewport ? Math.max(1, viewport.width - (layout?.headerHeight ?? 0)) : 0;
  const spacerHeight = viewport ? viewport.documentHeight + Math.max(0, contentHeight - visibleHeight) : 0;
  return <main id="smart-lyric-paging-display" aria-label="Rotated Wedge Lyrics" style={{ height: spacerHeight, background: "#050505" }}>
    {/* The probe stays unrotated: transformed rectangles cannot measure line height. */}
    <div ref={probe} aria-hidden="true" className="pointer-events-none invisible fixed left-0 top-0 whitespace-pre-wrap break-words font-semibold [overflow-wrap:anywhere]" />
    <div data-wedge-rotation={rotation} style={{ position: "fixed", left: viewport?.left ?? 0, top: viewport?.top ?? 0,
      width: viewport?.width ?? "100%", height: viewport?.height ?? "100dvh", overflow: "hidden", background: "#050505", color: "white" }}>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: viewport?.height ?? 0, height: viewport?.width ?? 0,
        transform: `translate(-50%, -50%) rotate(${rotation === "clockwise" ? 90 : -90}deg)`, transformOrigin: "center" }}>
        <header ref={header} className="border-b border-white/20 bg-black px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <button type="button" onClick={onCalibrate} className="min-h-11 rounded border border-white/30 px-3">Calibrate</button>
            <span>Page {pageNumber} of {layout?.pages.length ?? 0}</span>
            <button type="button" onClick={onReturn} className="min-h-11 rounded border border-white/30 px-3">Close</button>
          </div>
          <h1 className="break-words text-center text-xl font-bold">{config.title}</h1>
          {config.songKey && <p className="text-center text-sm font-bold">KEY: {config.songKey}</p>}
        </header>
        <div style={{ position: "absolute", top: layout?.headerHeight ?? 0, bottom: 0, width: "100%", overflow: "hidden" }}>
          <div ref={track} style={{ position: "relative" }}>
            {layout?.pages.map((page, index) => <section key={`${page.section}-${page.part}`} data-smart-lyric-page aria-label={`Lyric page ${index + 1}`}
              className="m-0 box-border flex flex-col justify-center border-2 border-white/10 p-6 font-semibold"
              style={{ minHeight: layout.pageHeight, fontSize: page.fontSize, lineHeight: lineSpacing }}>
              {page.lines.map((line, lineIndex) => <div key={lineIndex} data-lyric-section={anchors[index][lineIndex].section}
                data-lyric-line={line.originalLine} data-lyric-offset={anchors[index][lineIndex].characterOffset}
                className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{line.text}</div>)}
            </section>)}
          </div>
        </div>
      </div>
    </div>
  </main>;
}

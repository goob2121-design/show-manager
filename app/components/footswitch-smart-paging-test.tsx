"use client";

import { useEffect, useRef, useState } from "react";
import { nearestLyricPage, paginateLyricSections, splitLyricSections, type LyricPage } from "./footswitch-lyric-paging";
import { observeLyricPagePosition, observePagingViewport } from "./footswitch-smart-paging-observers";
import { SMART_PAGING_SAMPLES } from "./footswitch-smart-paging-samples";
import { alignmentStatus, applyDocumentSnap, DOCUMENT_SNAP_MODES, type DocumentSnapMode } from "./footswitch-document-snap";

const TEXT_SIZES = [{ label: "Large", pixels: 40 }, { label: "Extra Large", pixels: 48 }, { label: "Maximum", pixels: 56 }];

export function SmartLyricPagingTest({ onReturn }: { onReturn: () => void }) {
  const toolbar = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [sample, setSample] = useState<keyof typeof SMART_PAGING_SAMPLES>("realistic");
  const [preferredSize, setPreferredSize] = useState(48);
  const [snapMode, setSnapMode] = useState<DocumentSnapMode>("off");
  const [layout, setLayout] = useState<{ pageHeight: number; toolbarHeight: number; viewportHeight: number; documentHeight: number; pages: LyricPage[] }>({ pageHeight: 0, toolbarHeight: 0, viewportHeight: 0, documentHeight: 0, pages: [] });
  const [position, setPosition] = useState({ index: 0, offset: 0 });

  useEffect(() => {
    if (!toolbar.current || !rail.current || !probe.current) return;
    return observePagingViewport(window, toolbar.current, rail.current, (viewport) => {
      const measurement = probe.current;
      if (!measurement) return;
      // Page border + padding = 52px; the per-page diagnostic label occupies 32px.
      const pageHeight = Math.max(1, viewport.height - viewport.toolbarHeight);
      measurement.style.width = `${Math.max(1, viewport.width - 52)}px`;
      const pages = paginateLyricSections(splitLyricSections(SMART_PAGING_SAMPLES[sample]), {
        preferredFontSize: preferredSize, minimumFontSize: 28, contentHeight: Math.max(1, pageHeight - 84),
        measureLine: (text, fontSize) => {
          measurement.style.fontSize = `${fontSize}px`;
          measurement.textContent = text;
          return measurement.getBoundingClientRect().height;
        },
      });
      setLayout({ pageHeight, toolbarHeight: viewport.toolbarHeight, viewportHeight: viewport.height, documentHeight: document.scrollingElement?.clientHeight ?? window.innerHeight, pages });
    });
  }, [sample, preferredSize]);

  // React restores the old lease before a mode/toolbar change, and again on unmount.
  // Only CSS can change the scroll destination; there are no scroll writes here.
  useEffect(() => applyDocumentSnap(document, snapMode, layout.toolbarHeight), [snapMode, layout.toolbarHeight]);

  useEffect(() => observeLyricPagePosition(window, () => {
    const tops = Array.from(rail.current?.querySelectorAll<HTMLElement>("[data-smart-lyric-page]") ?? []).map((page) => page.getBoundingClientRect().top);
    const next = nearestLyricPage(tops, toolbar.current?.getBoundingClientRect().bottom ?? 0);
    setPosition((previous) => previous.index === next.index && Math.abs(previous.offset - next.offset) < 0.5 ? previous : next);
  }), [layout]);

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
          <select value={snapMode} onChange={(event) => setSnapMode(event.target.value as DocumentSnapMode)} className="rounded-xl border border-stone-300 bg-white p-2 dark:border-white/20 dark:bg-slate-800">
            {DOCUMENT_SNAP_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
          </select>
        </label>
        <p className="mt-2 text-sm">Native document scrolling · Diagnostic listeners OFF · Snap: {snapMode.toUpperCase()}. CSS may reposition the page when enabled. Press each pedal to compare alignment; Safari may ignore or skip snap points.</p>
        <p className="mt-1 font-mono text-sm font-bold">{layout.pages.length ? `Page ${position.index + 1} of ${layout.pages.length} · Boundary offset: ${Math.round(position.offset)} px · ${alignmentStatus(position.offset)}` : "Measuring available space…"}</p>
        <p className="mt-1 font-mono text-xs">Visual viewport: {Math.round(layout.viewportHeight)}px · Document viewport: {Math.round(layout.documentHeight)}px · Toolbar: {Math.round(layout.toolbarHeight)}px · Page: {Math.round(layout.pageHeight)}px. Chrome changes can reflow pages.</p>
      </header>

      <div ref={probe} aria-hidden="true" className="pointer-events-none invisible fixed left-0 top-0 whitespace-pre-wrap break-words font-semibold [overflow-wrap:anywhere]" style={{ lineHeight: 1.4 }} />
      <div ref={rail}>
        {layout.pages.map((page, index) => <section key={`${page.section}-${page.part}`} data-smart-lyric-page className="flex flex-col border-2 border-dashed border-emerald-500/60 p-6 odd:bg-white dark:odd:bg-slate-900" style={{ minHeight: layout.pageHeight, scrollSnapAlign: "start", scrollMarginTop: 0 }} aria-label={`Lyric page ${index + 1}`}>
          <p className="mb-3 text-sm font-bold text-emerald-800 dark:text-emerald-300" style={{ lineHeight: "20px" }}>Page {index + 1} · Section {page.section}{page.part > 1 ? ` · continued (${page.part})` : ""} · {page.fontSize}px{page.expanded ? " · Expanded to preserve text" : ""}</p>
          <div className="flex flex-1 flex-col justify-center text-left font-semibold" style={{ fontSize: page.fontSize, lineHeight: 1.4 }}>
            {page.lines.map((line, lineIndex) => <div key={lineIndex} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{line.text}</div>)}
          </div>
        </section>)}
      </div>
    </main>
  );
}

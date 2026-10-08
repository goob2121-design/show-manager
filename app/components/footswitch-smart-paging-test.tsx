"use client";

import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { alignmentStatus, applyDocumentSnap } from "./footswitch-document-snap";
import { SmartLyricPagingDisplay, type PagingMeasurement, type SmartPagingConfig } from "./footswitch-smart-paging-display";

const TEXT_SIZES = [{ label: "Large", pixels: 40 }, { label: "Extra Large", pixels: 48 }, { label: "Maximum", pixels: 56 }];

export function SmartLyricPagingTest({ onReturn }: { onReturn: () => void }) {
  const [config, setConfig] = useState<SmartPagingConfig>({ sample: "realistic", preferredSize: 48, calibration: 0 });
  const [displayActive, setDisplayActive] = useState(false);
  const [history, setHistory] = useState<PagingMeasurement[]>([]);
  const record = useCallback((measurement: PagingMeasurement) => {
    setHistory((previous) => {
      const last = previous[0];
      if (last && last.visiblePage === measurement.visiblePage && last.pageCount === measurement.pageCount &&
          last.config.sample === measurement.config.sample && last.config.preferredSize === measurement.config.preferredSize &&
          last.config.calibration === measurement.config.calibration &&
          last.layout.viewportHeight === measurement.layout.viewportHeight && last.layout.controlsHeight === measurement.layout.controlsHeight &&
          last.layout.documentHeight === measurement.layout.documentHeight &&
          last.layout.pageHeight === measurement.layout.pageHeight && last.layout.viewportChanged === measurement.layout.viewportChanged &&
          Math.abs(last.alignment.scrollPosition - measurement.alignment.scrollPosition) < 0.5 &&
          Math.abs(last.alignment.error - measurement.alignment.error) < 0.5) return previous;
      return [measurement, ...previous].slice(0, 10);
    });
  }, []);
  useEffect(() => applyDocumentSnap(document, "off", 0), []);
  // Commit the destination before following the user's native fragment link.
  // No JS scroll call or pedal handler establishes the starting position.
  return displayActive
    ? <SmartLyricPagingDisplay config={config} onReturn={() => flushSync(() => setDisplayActive(false))} onMeasurement={record} />
    : <SmartLyricPagingSetup config={config} onConfig={setConfig} history={history} onReturn={onReturn} onStart={() => flushSync(() => setDisplayActive(true))} />;
}

export function SmartLyricPagingSetup({ config, onConfig, history, onReturn, onStart }: {
  config: SmartPagingConfig; onConfig: (config: SmartPagingConfig) => void; history: PagingMeasurement[]; onReturn: () => void; onStart: () => void;
}) {
  const last = history[0];
  const buttonClass = "min-h-11 rounded-xl border border-stone-300 bg-white px-3 py-2 font-bold text-stone-800 dark:border-white/20 dark:bg-slate-800 dark:text-slate-100";
  return (
    <main id="smart-lyric-paging-setup" className="min-h-screen bg-stone-100 p-4 text-stone-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="rounded-3xl border border-stone-300 bg-white p-5 dark:border-white/20 dark:bg-slate-900">
          <h1 className="text-3xl font-black">Smart Lyric Paging Test · Setup</h1>
          <button type="button" className={buttonClass + " mt-3"} onClick={onReturn}>Back to Footswitch Test</button>
          <div className="mt-4 flex flex-wrap gap-3">
            <label className="font-bold">Sample <select value={config.sample} onChange={(event) => onConfig({ ...config, sample: event.target.value as SmartPagingConfig["sample"] })} className="rounded-xl border border-stone-300 bg-white p-2 dark:border-white/20 dark:bg-slate-800"><option value="realistic">Realistic song</option><option value="overflow">Long lines / overflow</option></select></label>
            {TEXT_SIZES.map((size) => <button key={size.label} type="button" className={buttonClass + (config.preferredSize === size.pixels ? " ring-2 ring-emerald-500" : "")} aria-pressed={config.preferredSize === size.pixels} onClick={() => onConfig({ ...config, preferredSize: size.pixels })}>{size.label}</button>)}
          </div>
          <label htmlFor="footswitch-page-height-calibration" className="mt-4 block font-bold">Footswitch Page Height Calibration</label>
          <div className="flex flex-wrap items-center gap-3">
            <span>-100px</span><input id="footswitch-page-height-calibration" type="range" min={-100} max={100} step={10} value={config.calibration} onChange={(event) => onConfig({ ...config, calibration: Number(event.target.value) })} className="min-h-10 min-w-40 flex-1 accent-emerald-600" /><span>+100px</span>
            <output htmlFor="footswitch-page-height-calibration" className="font-mono font-bold">Current Adjustment: {config.calibration > 0 ? "+" : ""}{config.calibration}px</output>
            <button type="button" className={buttonClass} onClick={() => onConfig({ ...config, calibration: 0 })}>Reset to 0</button>
          </div>
          <p className="mt-3 font-bold">Scroll Alignment: OFF — required. No scroll snapping or automatic corrections.</p>
          <a href="#smart-lyric-paging-display" onClick={onStart} className="mt-5 block rounded-xl bg-emerald-700 p-4 text-center text-lg font-black text-white hover:bg-emerald-800">START FULL-SCREEN LYRIC TEST</a>
          <p className="mt-3">Full-screen means a clean Safari page; no browser Fullscreen API is required. Setup is removed during testing. Start uses normal fragment navigation to the display beginning.</p>
        </header>
        <section className="rounded-3xl border border-stone-300 bg-white p-5 dark:border-white/20 dark:bg-slate-900" aria-label="Latest full-screen test measurements">
          <h2 className="text-xl font-black">Latest Full-Screen Test Measurements</h2>
          {!last ? <p className="mt-3">Start the lyric test to measure its actual visible area. Setup height is never used for lyric sizing.</p> : <div className="mt-3 space-y-2 font-mono text-sm">
            <p>Recorded: {last.timestamp} · {last.config.sample} · {last.config.preferredSize}px preferred text</p>
            <p>Page {last.visiblePage} of {last.pageCount} · Nearest boundary: Page {last.alignment.index + 1}</p>
            <p>Visual viewport: {Math.round(last.layout.viewportHeight)}px · Document viewport: {Math.round(last.layout.documentHeight)}px</p>
            <p>Full-screen controls: {Math.round(last.layout.controlsHeight)}px · Calculated Height: {Math.round(last.layout.calculatedHeight)}px</p>
            <p>Recorded Calibration: {last.config.calibration}px · Effective Height: {Math.round(last.layout.pageHeight)}px</p>
            <p>Current Scroll Position: {Math.round(last.alignment.scrollPosition)}px · Expected Page Boundary: {Math.round(last.alignment.boundary)}px</p>
            <p>Alignment Error: {last.alignment.error > 0 ? "+" : ""}{Math.round(last.alignment.error)}px · {alignmentStatus(last.alignment.error)}</p>
            {last.layout.viewportChanged && <p role="status" className="font-bold text-amber-700 dark:text-amber-300">Viewport changed during testing. Retest calibration in this orientation and browser-chrome position.</p>}
          </div>}
          <p className="mt-3 text-sm">Positive error = past the nearest boundary; negative = before it. Returning to Setup preserves these display measurements; setup geometry is not recorded.</p>
          {history.length > 0 && <><h3 className="mt-4 font-bold">Last 10 passive measurements · newest first</h3><ol className="mt-2 space-y-2 text-sm">{history.map((measurement, index) => <li key={index} className="break-words font-mono">{measurement.timestamp} · Page {measurement.visiblePage} · Scroll {Math.round(measurement.alignment.scrollPosition)}px · Boundary {Math.round(measurement.alignment.boundary)}px · Error {measurement.alignment.error > 0 ? "+" : ""}{Math.round(measurement.alignment.error)}px</li>)}</ol></>}
        </section>
        <section className="rounded-3xl border border-stone-300 bg-white p-5 dark:border-white/20 dark:bg-slate-900">
          <h2 className="text-xl font-black">How to Calibrate</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>Choose Extra Large, keep alignment OFF, and reset calibration to 0.</li>
            <li>Start the full-screen test. The first lyric page begins just below the small controls.</li>
            <li>Press Page Down three times, then return to Setup to inspect the recorded error.</li>
            <li>If Safari moves too far, increase page height. If it stops short, decrease it.</li>
            <li>Start again and repeat until several consecutive presses remain near page boundaries.</li>
          </ol>
          <p className="mt-3">Font, sample, orientation, and Safari toolbar changes can reflow pages. Start a fresh test after adjustments. Measurements are scroll samples, not detected pedal presses. Safari&apos;s Page Down distance is not assumed.</p>
        </section>
      </div>
    </main>
  );
}

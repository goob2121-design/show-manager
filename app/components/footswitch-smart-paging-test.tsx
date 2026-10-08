"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { alignmentStatus, applyDocumentSnap } from "./footswitch-document-snap";
import { SmartLyricPagingDisplay, type PagingMeasurement, type SmartPagingConfig } from "./footswitch-smart-paging-display";
import { calibrationProfileNeedsTesting, orientationCalibration, updateOrientationCalibration, useDiagnosticSettings } from "./footswitch-diagnostic-settings";
import { diagnosticSong, searchDiagnosticSongs, type FootswitchSong } from "./footswitch-song-source";
import { splitLyricSections } from "./footswitch-lyric-paging";
import { useDiagnosticFullscreen } from "./footswitch-fullscreen";

const TEXT_SIZES = [{ label: "Large", pixels: 40 }, { label: "Extra Large", pixels: 48 }, { label: "Maximum", pixels: 56 }];

export function SmartLyricPagingTest({ onReturn, songs = [], songStatus, onRetry }: { onReturn: () => void; songs?: readonly FootswitchSong[]; songStatus?: string; onRetry?: () => void }) {
  const { settings, setSettings, orientation, loaded, storageUnavailable } = useDiagnosticSettings();
  const fullscreen = useDiagnosticFullscreen();
  const song = diagnosticSong(settings, songs);
  const lyricText = song?.lyrics ?? "";
  const config = useMemo<SmartPagingConfig>(() => ({ sample: settings.sample, preferredSize: settings.preferredSize,
    calibration: orientationCalibration(settings, orientation, fullscreen.status.active), source: settings.source, songId: settings.songId,
    title: diagnosticSong(settings, songs)?.title, orientation, fullscreen: fullscreen.status.active }), [settings, orientation, songs, fullscreen.status.active]);
  const setConfig = (next: SmartPagingConfig) => setSettings((current) => {
    const changed = { ...current, sample: next.sample, preferredSize: next.preferredSize };
    return next.calibration === orientationCalibration(current, orientation, fullscreen.status.active) ? changed : updateOrientationCalibration(changed, orientation, next.calibration, fullscreen.status.active);
  });
  const [displayActive, setDisplayActive] = useState(false);
  const [history, setHistory] = useState<PagingMeasurement[]>([]);
  const record = useCallback((measurement: PagingMeasurement) => {
    setHistory((previous) => {
      const last = previous[0];
      if (last && last.visiblePage === measurement.visiblePage && last.pageCount === measurement.pageCount &&
          last.config.sample === measurement.config.sample && last.config.preferredSize === measurement.config.preferredSize &&
          last.config.calibration === measurement.config.calibration &&
          last.config.source === measurement.config.source && last.config.songId === measurement.config.songId && last.config.orientation === measurement.config.orientation && last.config.fullscreen === measurement.config.fullscreen &&
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
    ? <SmartLyricPagingDisplay config={config} lyricText={lyricText} fullscreenLabel={fullscreen.status.label}
        onReturn={() => {
          // Dismiss the only lyric view before Safari starts its asynchronous exit.
          // Fullscreen events only update status/profile; they never reopen lyrics.
          flushSync(() => setDisplayActive(false));
          void fullscreen.close();
        }} onCalibrate={() => flushSync(() => setDisplayActive(false))} onMeasurement={record} />
    : <SmartLyricPagingSetup config={config} onConfig={setConfig} history={history} onReturn={() => { void fullscreen.close(); onReturn(); }}
        canStart={loaded && Boolean(lyricText.trim()) && !(settings.source === "stageflow" && songStatus)}
        onStart={() => { if (loaded && lyricText.trim()) flushSync(() => setDisplayActive(true)); }}
        fullscreenControls={<section className="mt-4 rounded-xl border border-stone-300 p-3 dark:border-white/20" aria-label="Experimental browser fullscreen">
          <h2 className="font-bold">Experimental Browser Fullscreen</h2>
          <p role="status" className="mt-2 text-sm">{fullscreen.status.message}</p>
          {fullscreen.status.active && <button type="button" className="mt-2 rounded-lg border p-3 font-bold" onClick={() => { void fullscreen.close(); }}>Exit Browser Fullscreen</button>}
          <p className="mt-2 text-sm">Targets the document root, not a lyric container. Browser chrome and native Page Down distance may change; retest pedal behavior and calibration. The normal test above stays available.</p>
          {loaded && lyricText.trim() && !(settings.source === "stageflow" && songStatus) ? <a href="#smart-lyric-paging-display" className="mt-3 block rounded-lg border border-emerald-500 p-3 text-center font-bold" onClick={() => {
            fullscreen.request();
            flushSync(() => setDisplayActive(true));
          }}>TRY EXPERIMENTAL BROWSER FULLSCREEN</a> : <button type="button" disabled className="mt-3 rounded-lg border p-3 font-bold opacity-50">TRY EXPERIMENTAL BROWSER FULLSCREEN</button>}
        </section>}
        sourceControls={<fieldset disabled={!loaded}><FootswitchSongSelection source={settings.source} songId={settings.songId} songs={songs} songStatus={songStatus} onRetry={onRetry}
          onSource={(source) => setSettings((current) => ({ ...current, source }))} onSong={(songId) => setSettings((current) => ({ ...current, songId }))} /></fieldset>}
        sectionCount={splitLyricSections(lyricText).length} missingLyrics={Boolean(song && !lyricText.trim())}
        notice={!loaded ? "Loading saved diagnostic settings…" : storageUnavailable ? "Settings storage is unavailable. Changes apply for this test only." : undefined}
        needsCalibration={calibrationProfileNeedsTesting(settings, orientation, fullscreen.status.active)}
        onReset={() => setSettings((current) => updateOrientationCalibration(current, orientation, 0, fullscreen.status.active))} />;
}

export function FootswitchSongSelection({ source, songId, songs, songStatus, onRetry, onSource, onSong }: {
  source: "sample" | "stageflow"; songId: string; songs: readonly FootswitchSong[]; songStatus?: string;
  onSource: (source: "sample" | "stageflow") => void; onSong: (songId: string) => void; onRetry?: () => void;
}) {
  const [query, setQuery] = useState("");
  const results = searchDiagnosticSongs(songs, query);
  return <div className="mt-4 space-y-3">
    <label className="block font-bold">Song source <select value={source} onChange={(event) => onSource(event.target.value as "sample" | "stageflow")} className="rounded-xl border p-2 dark:bg-slate-800"><option value="sample">Sample Songs</option><option value="stageflow">StageFlow Songs</option></select></label>
    {source === "stageflow" && <>
      <p className="text-sm">Search the complete accessible StageFlow song library, plus this show&apos;s guest and setlist-only songs. Read-only; original saved lyrics are used.</p>
      {songStatus ? <div role="status"><p>{songStatus}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-2 rounded-xl border p-3 font-bold">Retry loading songs</button>}</div> : <>
        <label className="block font-bold">Search songs <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-xl border p-3 dark:bg-slate-800" /></label>
        {songs.length === 0 ? <p>The song library loaded successfully, but no songs are available to this session. No guest or setlist-only songs are available for this show either.</p> : <ul aria-label="StageFlow songs" className="space-y-2">{results.map((song) => <li key={song.id}><button type="button" aria-pressed={songId === song.id || song.aliases?.includes(songId)} onClick={() => onSong(song.id)} className={`w-full rounded-xl border p-3 text-left font-bold ${songId === song.id || song.aliases?.includes(songId) ? "ring-2 ring-emerald-500" : ""}`}>{song.title}{song.kind ? ` · ${song.kind}` : ""}{!song.lyrics?.trim() ? " · No lyrics" : ""}</button></li>)}</ul>}
        {songs.length > 0 && results.length === 0 && <p>No songs match your search.</p>}
        {songs.length > 0 && !songs.some((song) => song.id === songId || song.aliases?.includes(songId)) && <p>Select a song to begin. The previously selected song may no longer be available to this session.</p>}
      </>}
    </>}
  </div>;
}

export function SmartLyricPagingSetup({ config, onConfig, history, onReturn, onStart, sourceControls, fullscreenControls, sectionCount, missingLyrics, notice, needsCalibration, canStart = true, onReset }: {
  config: SmartPagingConfig; onConfig: (config: SmartPagingConfig) => void; history: PagingMeasurement[]; onReturn: () => void; onStart: () => void;
  sourceControls?: ReactNode; sectionCount?: number; missingLyrics?: boolean; notice?: string; needsCalibration?: boolean; canStart?: boolean; onReset?: () => void;
  fullscreenControls?: ReactNode;
}) {
  const last = history[0];
  const buttonClass = "min-h-11 rounded-xl border border-stone-300 bg-white px-3 py-2 font-bold text-stone-800 dark:border-white/20 dark:bg-slate-800 dark:text-slate-100";
  return (
    <main id="smart-lyric-paging-setup" className="min-h-screen bg-stone-100 p-4 text-stone-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="rounded-3xl border border-stone-300 bg-white p-5 dark:border-white/20 dark:bg-slate-900">
          <h1 className="text-3xl font-black">Smart Lyric Paging Test · Setup</h1>
          <button type="button" className={buttonClass + " mt-3"} onClick={onReturn}>Back to Footswitch Test</button>
          {sourceControls}
          {notice && <p role="status" className="mt-3">{notice}</p>}
          <fieldset disabled={notice === "Loading saved diagnostic settings…"}>
          <div className="mt-4 flex flex-wrap gap-3">
            {config.source !== "stageflow" && <label className="font-bold">Sample <select value={config.sample} onChange={(event) => onConfig({ ...config, sample: event.target.value as SmartPagingConfig["sample"] })} className="rounded-xl border border-stone-300 bg-white p-2 dark:border-white/20 dark:bg-slate-800"><option value="realistic">Realistic song</option><option value="overflow">Long lines / overflow</option></select></label>}
            {TEXT_SIZES.map((size) => <button key={size.label} type="button" className={buttonClass + (config.preferredSize === size.pixels ? " ring-2 ring-emerald-500" : "")} aria-pressed={config.preferredSize === size.pixels} onClick={() => onConfig({ ...config, preferredSize: size.pixels })}>{size.label}</button>)}
          </div>
          <label htmlFor="footswitch-page-height-calibration" className="mt-4 block font-bold">Footswitch Page Height Calibration · {config.fullscreen ? "Fullscreen" : "Regular Safari"} — {config.orientation === "landscape" ? "Landscape" : "Portrait"}</label>
          <div className="flex flex-wrap items-center gap-3">
            <span>-300px</span><input id="footswitch-page-height-calibration" type="range" min={-300} max={300} step={5} value={config.calibration} onChange={(event) => onConfig({ ...config, calibration: Number(event.target.value) })} className="min-h-10 min-w-40 flex-1 accent-emerald-600" /><span>+300px</span>
            <output htmlFor="footswitch-page-height-calibration" className="font-mono font-bold">Current Adjustment: {config.calibration > 0 ? "+" : ""}{config.calibration}px</output>
            <button type="button" className={buttonClass} onClick={() => onReset ? onReset() : onConfig({ ...config, calibration: 0 })}>Reset to 0</button>
          </div>
          </fieldset>
          <p className="mt-3 font-bold">Current orientation: {config.orientation ?? "portrait"} · Browser fullscreen: {config.fullscreen ? "Active" : "Inactive"} · Font: {config.preferredSize}px · Calibration: {config.calibration}px</p>
          <p className="mt-2">Regular and fullscreen calibration are saved separately for each orientation. Portrait starts at −100px; landscape starts at 0px. These are starting points. Adjust manually on your device.</p>
          {needsCalibration && <p role="status" className="mt-2 text-amber-700 dark:text-amber-300">Verify calibration for this orientation; its default has not been adjusted on this browser.</p>}
          <p className="mt-3">Song: {config.title ?? "None selected"} · Detected lyric sections: {sectionCount ?? 0} · Generated pages: {last && last.config.songId === config.songId && last.config.sample === config.sample && last.config.source === config.source && last.config.preferredSize === config.preferredSize && last.config.calibration === config.calibration && last.config.orientation === config.orientation && last.config.fullscreen === config.fullscreen ? last.pageCount : "Start test to measure"}</p>
          {missingLyrics && <p role="status" className="mt-3 font-bold">No lyrics available for this song.</p>}
          <p className="mt-3 font-bold">Scroll Alignment: OFF — required. No scroll snapping or automatic corrections.</p>
          {canStart ? <a href="#smart-lyric-paging-display" onClick={onStart} className="mt-5 block rounded-xl bg-emerald-700 p-4 text-center text-lg font-black text-white hover:bg-emerald-800">{config.fullscreen ? "RESUME LYRICS IN FULLSCREEN" : "START FULL-SCREEN LYRIC TEST"}</a> : <button type="button" disabled className="mt-5 w-full rounded-xl bg-stone-400 p-4 text-lg font-black text-white">START FULL-SCREEN LYRIC TEST</button>}
          <p className="mt-3">Full-screen means a clean Safari page; no browser Fullscreen API is required. Setup is removed during testing. Start uses normal fragment navigation to the display beginning.</p>
          <p className="mt-2 text-sm">During lyrics, tap the song title to toggle runtime diagnostics. Compare requested/applied calibration, calibrated height, rendered height, and CSS min-height at −300px and +300px.</p>
          {fullscreenControls}
        </header>
        <section className="rounded-3xl border border-stone-300 bg-white p-5 dark:border-white/20 dark:bg-slate-900" aria-label="Latest full-screen test measurements">
          <h2 className="text-xl font-black">Latest Full-Screen Test Measurements</h2>
          {!last ? <p className="mt-3">Start the lyric test to measure its actual visible area. Setup height is never used for lyric sizing.</p> : <div className="mt-3 space-y-2 font-mono text-sm">
            <p>Recorded: {last.timestamp} · {last.config.title ?? last.config.sample} · {last.config.fullscreen ? "Fullscreen" : "Regular Safari"} — {last.config.orientation ?? "portrait"} · {last.config.preferredSize}px preferred text</p>
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
            <li>Begin with Maximum text and −100px in portrait for the tested iPad. Keep alignment OFF. Other devices and landscape need their own calibration.</li>
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

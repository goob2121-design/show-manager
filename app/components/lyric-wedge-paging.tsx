"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createWedgePageReset, resetWedgePosition } from "@/lib/lyric-wedge";
import type { WedgeSong } from "./lyric-wedge";
import { SmartLyricPagingDisplay, type PagingMeasurement, type SmartPagingConfig } from "./footswitch-smart-paging-display";
import { SmartLyricPagingSetup } from "./footswitch-smart-paging-test";
import { splitLyricSections } from "./footswitch-lyric-paging";
import { applyDocumentSnap } from "./footswitch-document-snap";
import { adjustWedgeFont, adjustWedgeSpacing, useWedgeSettings, wedgeCalibration, updateWedgeCalibration, wedgeCalibrationNeedsTesting, type WedgeRotation } from "./lyric-wedge-settings";
import { WedgeRotatedLyrics } from "./wedge-rotated-lyrics";
import { useWedgeLyricSync } from "./lyric-sync-integration";
import { createEnhancedFootswitchScrolling, FOOTSWITCH_SCROLL_SPEEDS } from "./enhanced-footswitch-scrolling";

export function LyricWedgePaging({ song, setupControls, fullscreen, connection, status, showId }: {
  song: WedgeSong | null; setupControls: ReactNode; fullscreen: boolean; connection: string; status?: string; showId?: string;
}) {
  const { settings, setSettings, orientation, loaded, storageUnavailable } = useWedgeSettings();
  // Auto-open on initial following; Close/Calibrate explicitly select setup.
  const [displayActive, setDisplayActive] = useState(true);
  const sync = useWedgeLyricSync(showId, song, () => setDisplayActive(true));
  const [history, setHistory] = useState<PagingMeasurement[]>([]);
  const songId = song?.id;
  const enhancedScroll = useRef<ReturnType<typeof createEnhancedFootswitchScrolling> | null>(null);
  const enhancedActive = loaded && displayActive && !status && Boolean(song?.lyrics?.trim())
    && settings.enhancedFootswitchScrolling && !sync.following;
  // Cancel before paint when a different song or positional sync takes ownership.
  useLayoutEffect(() => {
    if (!enhancedActive) return;
    const controller = createEnhancedFootswitchScrolling(window, document, {
      enabled: true, speed: settings.footswitchScrollSpeed, inactivityMs: settings.footswitchInactivityMs,
    });
    enhancedScroll.current = controller;
    return () => { controller.destroy(); enhancedScroll.current = null; };
  }, [enhancedActive, songId, song?.lyrics, fullscreen, settings.rotation, settings.footswitchScrollSpeed, settings.footswitchInactivityMs]);
  const reset = useMemo(() => createWedgePageReset(songId), [songId]);
  const config = useMemo<SmartPagingConfig>(() => ({ sample: "realistic", source: "stageflow",
    songId: song?.id, title: song?.title, songKey: song?.key, preferredSize: settings.preferredSize, lineSpacing: settings.lineSpacing,
    calibration: wedgeCalibration(settings, orientation, fullscreen), orientation, fullscreen,
  }), [song?.id, song?.title, song?.key, settings, orientation, fullscreen]);
  useEffect(() => applyDocumentSnap(document, "off", 0), []);
  const record = useCallback((measurement: PagingMeasurement) => {
    if (!songId || measurement.config.songId !== songId || !measurement.pageCount) return;
    // The shared display reports only after measured page elements exist.
    reset.ready(songId, () => resetWedgePosition(window));
    setHistory((previous) => [measurement, ...previous].slice(0, 10));
  }, [songId, reset]);
  useEffect(() => {
    if (loaded && displayActive && song && !song.lyrics?.trim()) reset.ready(song.id, () => resetWedgePosition(window));
  }, [loaded, displayActive, song, reset]);
  const setup = () => {
    enhancedScroll.current?.stop();
    flushSync(() => setDisplayActive(false));
    // Explicit setup navigation, never pedal-driven or a paging correction.
    resetWedgePosition(window);
  };
  const start = () => flushSync(() => setDisplayActive(true));

  if (!loaded || !song || status) return <main className="min-h-screen bg-[#050505] p-5 text-white" aria-label="Lyric Wedge setup">
    {setupControls}<p role="status" className="mt-8 text-xl">{!loaded ? "Loading saved wedge settings…" : status ?? "Waiting for the leader to select a song."}</p>
  </main>;
  if (!displayActive) return <SmartLyricPagingSetup config={config} history={history}
    onReturn={start} returnLabel="Return to Wedge Lyrics" onStart={start} startLabel="OPEN WEDGE LYRICS"
    experimentControls={<fieldset className="mt-4 rounded-xl border p-3">
      <label className="mb-3 flex min-h-11 flex-wrap items-center gap-2 font-semibold">Wedge Display Rotation
        <select aria-label="Wedge Display Rotation" value={settings.rotation} onChange={(event) => setSettings((current) => ({ ...current, rotation: event.target.value as WedgeRotation }))} className="min-h-11 rounded border border-stone-300 bg-white px-2 text-stone-950 dark:border-white/20 dark:bg-slate-800 dark:text-white">
          <option value="normal">Normal</option><option value="clockwise">90° Clockwise</option><option value="counterclockwise">90° Counterclockwise</option>
        </select>
      </label>
      {settings.rotation !== "normal" && <p className="mb-3 text-sm">Experimental rotated view. Calibration is saved separately from Normal.</p>}
      <label className="flex min-h-11 items-center gap-2 font-bold"><input type="checkbox" checked={settings.enhancedFootswitchScrolling} onChange={(event) => setSettings((current) => ({ ...current, enhancedFootswitchScrolling: event.target.checked }))} className="h-5 w-5" />Enhanced Footswitch Scrolling</label>
      {settings.enhancedFootswitchScrolling && <div className="mt-2 flex flex-wrap items-center gap-4">
        <label className="font-semibold">Scroll Speed <select aria-label="Footswitch Scroll Speed" value={settings.footswitchScrollSpeed} onChange={(event) => setSettings((current) => ({ ...current, footswitchScrollSpeed: Number(event.target.value) }))} className="min-h-11 rounded border border-stone-300 bg-white px-2 text-stone-950 dark:border-white/20 dark:bg-slate-800 dark:text-white">{FOOTSWITCH_SCROLL_SPEEDS.map((speed) => <option key={speed.pixelsPerSecond} value={speed.pixelsPerSecond}>{speed.label}</option>)}</select></label>
        <label className="font-semibold">Stop After Inactivity <input aria-label="Footswitch Inactivity Timeout" type="range" min={80} max={300} step={20} value={settings.footswitchInactivityMs} onChange={(event) => setSettings((current) => ({ ...current, footswitchInactivityMs: Number(event.target.value) }))} className="min-h-11 align-middle" /> <output>{settings.footswitchInactivityMs} ms</output></label>
      </div>}
      {settings.enhancedFootswitchScrolling && sync.following && <p role="status" className="mt-2 text-sm text-amber-600 dark:text-amber-200">Enhanced scrolling paused: following the leader&apos;s lyric position.</p>}
    </fieldset>}
    typographyControls={<div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Font Size">
        <span className="font-bold">Font Size</span>
        <button type="button" aria-label="Decrease font size" disabled={settings.preferredSize <= 32} className="min-h-11 min-w-11 rounded-xl border px-3 font-bold disabled:opacity-40" onClick={() => setSettings((current) => ({ ...current, preferredSize: adjustWedgeFont(current.preferredSize, -1) }))}>−</button>
        <output aria-live="polite">{settings.preferredSize}px preferred</output>
        <button type="button" aria-label="Increase font size" disabled={settings.preferredSize >= 96} className="min-h-11 min-w-11 rounded-xl border px-3 font-bold disabled:opacity-40" onClick={() => setSettings((current) => ({ ...current, preferredSize: adjustWedgeFont(current.preferredSize, 1) }))}>+</button>
      </div>
      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Line Spacing">
        <span className="font-bold">Line Spacing</span>
        <button type="button" aria-label="Decrease line spacing" disabled={settings.lineSpacing <= 1.2} className="min-h-11 min-w-11 rounded-xl border px-3 font-bold disabled:opacity-40" onClick={() => setSettings((current) => ({ ...current, lineSpacing: adjustWedgeSpacing(current.lineSpacing, -1) }))}>−</button>
        <output aria-live="polite">{settings.lineSpacing.toFixed(1)}×</output>
        <button type="button" aria-label="Increase line spacing" disabled={settings.lineSpacing >= 1.8} className="min-h-11 min-w-11 rounded-xl border px-3 font-bold disabled:opacity-40" onClick={() => setSettings((current) => ({ ...current, lineSpacing: adjustWedgeSpacing(current.lineSpacing, 1) }))}>+</button>
      </div>
      <p className="text-sm">Preferred size: 32–96px in 4px steps. Sections may use smaller text to fit. Line spacing: 1.2–1.8. Changes are saved only on this wedge; verify page alignment after adjusting typography.</p>
    </div>}
    sourceControls={setupControls} sectionCount={splitLyricSections(song.lyrics ?? "").length}
    missingLyrics={!song.lyrics?.trim()} needsCalibration={wedgeCalibrationNeedsTesting(settings, orientation, fullscreen)}
    notice={storageUnavailable ? "Wedge settings storage is unavailable. Changes apply for this session only." : "Calibration is saved independently on this Lyric Wedge device."}
    onConfig={(next) => setSettings((current) => {
      const changed = { ...current, preferredSize: next.preferredSize };
      return next.calibration === wedgeCalibration(current, orientation, fullscreen)
        ? changed : updateWedgeCalibration(changed, orientation, next.calibration, fullscreen);
    })}
    onReset={() => setSettings((current) => updateWedgeCalibration(current, orientation, 0, fullscreen))} />;
  if (!song.lyrics?.trim()) return <main className="min-h-screen bg-[#050505] p-6 text-white" aria-label="Lyric Wedge">
    <button type="button" onClick={setup} className="min-h-11 rounded-lg border px-4">Wedge Setup</button>
    <h1 className="mt-6 text-3xl font-bold">{song.title}</h1>
    {song.key && <p className="mt-2 text-xl">KEY: {song.key}</p>}
    <p role="status" className="mt-8 text-2xl">No lyrics available for this song.</p>
  </main>;
  return <>
    {sync.status && <p role="status" className="pointer-events-none fixed bottom-2 left-2 z-20 rounded bg-black/90 px-2 py-1 text-xs text-white">{sync.following ? "Follow the Leader" : "Wedge Flow"} · Lyric Sync: {sync.status}{settings.enhancedFootswitchScrolling && sync.following && <span className="block text-amber-200">Enhanced scrolling paused: following the leader&apos;s lyric position.</span>}</p>}
    {settings.rotation === "normal" ? <SmartLyricPagingDisplay key={song.id} config={config} lyricText={song.lyrics}
      onReturn={setup} onCalibrate={setup} onMeasurement={record} />
      : <WedgeRotatedLyrics key={`${song.id}:${settings.rotation}`} rotation={settings.rotation} config={config} lyricText={song.lyrics}
        onReturn={setup} onCalibrate={setup} onMeasurement={record} />}
    {connection !== "connected" && <p role="status" className="pointer-events-none fixed bottom-2 right-2 z-20 rounded bg-black/90 px-2 py-1 text-xs text-white">{connection === "disconnected" ? "Disconnected — keeping last song" : "Connecting…"}</p>}
  </>;
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { SmartLyricPagingDisplay, type PagingMeasurement, type SmartPagingConfig } from "./footswitch-smart-paging-display";
import { SmartLyricPagingSetup } from "./footswitch-smart-paging-test";
import { orientationCalibration, updateOrientationCalibration, useDiagnosticSettings } from "./footswitch-diagnostic-settings";
import type { useDiagnosticFullscreen } from "./footswitch-fullscreen";
import { applyDocumentSnap } from "./footswitch-document-snap";
import { splitLyricSections } from "./footswitch-lyric-paging";
import { FootswitchReturnTestDisplay } from "./footswitch-return-test-display";
import { createEnhancedFootswitchScrolling, FOOTSWITCH_SCROLL_SPEEDS } from "./enhanced-footswitch-scrolling";

// Rollback: set false to restore the preserved Live Mode modal and Auto Scroll UI.
export const SMART_LYRIC_PAGING_ENABLED: boolean = true;

export function LiveSmartLyrics({ song, fullscreen, onClose, exitFullscreenOnClose = true, returnToLibrary = false }: { song: { id: string; title: string; lyrics: string | null; key?: string | null; performanceFlow?: string | null }; fullscreen: ReturnType<typeof useDiagnosticFullscreen>; onClose: () => void; exitFullscreenOnClose?: boolean; returnToLibrary?: boolean }) {
  const { settings, setSettings, orientation, loaded, storageUnavailable } = useDiagnosticSettings();
  const fullscreenMessage = ["Unavailable", "Declined", "Not entered"].includes(fullscreen.status.label)
    ? "Lyrics remain available normally. Fullscreen is optional." : fullscreen.status.message;
  const [calibrating, setCalibrating] = useState(false);
  // Native Page Down is the session default; saved preferences remain untouched.
  const [enhancedEnabled, setEnhancedEnabled] = useState(false);
  const [history, setHistory] = useState<PagingMeasurement[]>([]);
  const enhancedScroll = useRef<ReturnType<typeof createEnhancedFootswitchScrolling> | null>(null);
  useEffect(() => {
    if (!loaded || calibrating || !song.lyrics?.trim() || !enhancedEnabled) return;
    const controller = createEnhancedFootswitchScrolling(window, document, {
      enabled: true, speed: settings.footswitchScrollSpeed, inactivityMs: settings.footswitchInactivityMs,
    });
    enhancedScroll.current = controller;
    return () => { controller.destroy(); enhancedScroll.current = null; };
  }, [loaded, calibrating, song.id, song.lyrics, enhancedEnabled, settings.footswitchScrollSpeed, settings.footswitchInactivityMs]);
  const record = useCallback((measurement: PagingMeasurement) => setHistory((previous) => [measurement, ...previous].slice(0, 10)), []);
  useEffect(() => applyDocumentSnap(document, "off", 0), []);
  const config = useMemo<SmartPagingConfig>(() => ({ sample: settings.sample, preferredSize: settings.preferredSize,
    calibration: orientationCalibration(settings, orientation, fullscreen.status.active), orientation, fullscreen: fullscreen.status.active,
    source: "stageflow", songId: song.id, title: song.title, songKey: song.key, performanceFlow: song.performanceFlow }), [settings, orientation, fullscreen.status.active, song.id, song.title, song.key, song.performanceFlow]);
  const close = () => {
    enhancedScroll.current?.stop();
    // Keep a pre-existing Live Mode fullscreen session; exit only lyric-owned entry.
    flushSync(onClose);
    if (exitFullscreenOnClose) void fullscreen.close();
  };
  const calibrate = () => {
    enhancedScroll.current?.stop();
    flushSync(() => setCalibrating(true));
  };
  const controls = <section aria-label="Browser fullscreen" className="mt-4 rounded-xl border p-3">
    <p role="status">{fullscreenMessage}</p>
    {fullscreen.status.active
      ? <button type="button" className="mt-2 min-h-11 rounded-lg border p-3 font-bold" onClick={() => { void fullscreen.close(); }}>Exit Browser Fullscreen</button>
      : <button type="button" className="mt-2 min-h-11 rounded-lg border p-3 font-bold" onClick={() => fullscreen.request()}>Enter Browser Fullscreen</button>}
    <p className="mt-2 text-sm">Calibration follows the actual browser mode shown above. If fullscreen exits, the regular Safari profile applies.</p>
  </section>;
  if (!loaded || !song.lyrics?.trim()) return <main id="smart-lyric-paging-display" tabIndex={returnToLibrary ? -1 : undefined} className="min-h-screen bg-slate-950 p-6 text-white">
    <h1 className="text-2xl font-bold">{song.title}</h1>
    <p role="status" className="mt-4">{!loaded ? "Loading saved lyric settings…" : "No lyrics available for this song."}</p>
    <button type="button" className="mt-4 min-h-11 rounded-lg border p-3 font-bold" onClick={close}>× Close</button>
  </main>;
  if (calibrating) return <SmartLyricPagingSetup config={config} history={history} onReturn={close}
    onConfig={(next) => setSettings((current) => {
      const changed = { ...current, preferredSize: next.preferredSize };
      return next.calibration === orientationCalibration(current, orientation, fullscreen.status.active)
        ? changed : updateOrientationCalibration(changed, orientation, next.calibration, fullscreen.status.active);
    })}
    onReset={() => setSettings((current) => updateOrientationCalibration(current, orientation, 0, fullscreen.status.active))}
    onStart={() => flushSync(() => setCalibrating(false))} sectionCount={splitLyricSections(song.lyrics).length}
    fullscreenControls={controls} returnLabel={returnToLibrary ? "Back to Music Library" : "Back to Live Mode"} startLabel={fullscreen.status.active ? "RESUME LYRICS IN FULLSCREEN" : "RESUME LYRICS"}
    experimentControls={<>
      <fieldset className="mt-4 rounded-xl border p-3">
        <label className="flex min-h-11 items-center gap-2 font-bold"><input type="checkbox" checked={enhancedEnabled} onChange={(event) => setEnhancedEnabled(event.target.checked)} className="h-5 w-5" />Enhanced Footswitch Scrolling</label>
        <p className="mt-1 text-sm">Off at the start of each session. Enabling applies until Close. Regular Page Down scrolling is unchanged.</p>
        {enhancedEnabled && <div className="mt-2 flex flex-wrap items-center gap-4">
          <label className="font-semibold">Scroll Speed <select value={settings.footswitchScrollSpeed} onChange={(event) => setSettings((current) => ({ ...current, footswitchScrollSpeed: Number(event.target.value) }))} className="min-h-11 rounded border border-stone-300 bg-white px-2 text-stone-950 dark:border-white/20 dark:bg-slate-800 dark:text-white">{FOOTSWITCH_SCROLL_SPEEDS.map((speed) => <option key={speed.pixelsPerSecond} value={speed.pixelsPerSecond}>{speed.label}</option>)}</select></label>
          <label className="font-semibold">Stop After Inactivity <input type="range" min={80} max={300} step={20} value={settings.footswitchInactivityMs} onChange={(event) => setSettings((current) => ({ ...current, footswitchInactivityMs: Number(event.target.value) }))} className="min-h-11 align-middle" /> <output>{settings.footswitchInactivityMs} ms</output></label>
        </div>}
      </fieldset>
      {returnToLibrary ? <p className="mt-4 rounded-xl border p-3">{enhancedEnabled ? "Automatic return to Music Library is paused while Enhanced Footswitch Scrolling is on. Use Close to return." : "After reading the final lyric page, pause, then press Page Down again to return to Music Library."}</p> : <label className="mt-4 block rounded-xl border p-3 font-bold"><input type="checkbox" checked={settings.footswitchReturnToSetlist} disabled={enhancedEnabled} onChange={(event) => setSettings((current) => ({ ...current, footswitchReturnToSetlist: event.target.checked }))} className="mr-2 h-5 w-5 align-middle" />Footswitch Return to Setlist<span className="mt-1 block text-sm font-normal">{enhancedEnabled ? "Automatic return is paused while Enhanced Footswitch Scrolling is on." : "After the final lyrics, another downward scroll returns to the current Live Mode song. Off by default."}</span></label>}
    </>}
    sourceControls={Boolean(song.key?.trim() || song.performanceFlow?.trim()) ? <p className="mt-3 text-sm">The key/arrangement header is measured automatically. Its height can change page alignment; verify calibration on your iPad. Existing saved values are preserved.</p> : undefined}
    notice={storageUnavailable ? "Settings storage is unavailable. Changes apply for this session only." : undefined} />;
  return <>
    {(returnToLibrary || settings.footswitchReturnToSetlist) && !enhancedEnabled
      ? <FootswitchReturnTestDisplay key={song.id} config={config} lyricText={song.lyrics} fullscreenLabel={fullscreen.status.label}
          returnDestination={returnToLibrary ? "Music Library" : "Setlist"} onTrigger={close} onReturn={close} onCalibrate={calibrate} onMeasurement={record} />
      : <SmartLyricPagingDisplay key={song.id} config={config} lyricText={song.lyrics} fullscreenLabel={fullscreen.status.label}
          onReturn={close} onCalibrate={calibrate} onMeasurement={record} />}
    {!fullscreen.status.active && <div className="pointer-events-none fixed bottom-3 right-3 z-20 max-w-xs rounded-xl bg-black/90 p-2 text-xs text-white">
      <button type="button" className="pointer-events-auto min-h-11 rounded-lg border border-white/30 px-3 font-bold" onClick={() => fullscreen.request()}>Enter Browser Fullscreen</button>
      <p role="status" className="mt-1">{fullscreenMessage}</p>
    </div>}
  </>;
}

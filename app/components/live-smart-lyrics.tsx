"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { SmartLyricPagingDisplay, type PagingMeasurement, type SmartPagingConfig } from "./footswitch-smart-paging-display";
import { SmartLyricPagingSetup } from "./footswitch-smart-paging-test";
import { orientationCalibration, updateOrientationCalibration, useDiagnosticSettings } from "./footswitch-diagnostic-settings";
import { useDiagnosticFullscreen } from "./footswitch-fullscreen";
import { applyDocumentSnap } from "./footswitch-document-snap";
import { splitLyricSections } from "./footswitch-lyric-paging";

// Rollback: set false to restore the preserved Live Mode modal and Auto Scroll UI.
export const SMART_LYRIC_PAGING_ENABLED: boolean = true;

export function LiveSmartLyrics({ song, onClose }: { song: { id: string; title: string; lyrics: string | null }; onClose: () => void }) {
  const { settings, setSettings, orientation, loaded, storageUnavailable } = useDiagnosticSettings();
  const fullscreen = useDiagnosticFullscreen();
  const [calibrating, setCalibrating] = useState(false);
  const [history, setHistory] = useState<PagingMeasurement[]>([]);
  const record = useCallback((measurement: PagingMeasurement) => setHistory((previous) => [measurement, ...previous].slice(0, 10)), []);
  useEffect(() => applyDocumentSnap(document, "off", 0), []);
  const config = useMemo<SmartPagingConfig>(() => ({ sample: settings.sample, preferredSize: settings.preferredSize,
    calibration: orientationCalibration(settings, orientation, fullscreen.status.active), orientation, fullscreen: fullscreen.status.active,
    source: "stageflow", songId: song.id, title: song.title }), [settings, orientation, fullscreen.status.active, song.id, song.title]);
  const close = () => {
    // Parent commits Live Mode before the fullscreen helper's unmount cleanup exits.
    flushSync(onClose);
    void fullscreen.close();
  };
  const controls = <section aria-label="Browser fullscreen" className="mt-4 rounded-xl border p-3">
    <p role="status">{fullscreen.status.message}</p>
    {fullscreen.status.active
      ? <button type="button" className="mt-2 min-h-11 rounded-lg border p-3 font-bold" onClick={() => { void fullscreen.close(); }}>Exit Browser Fullscreen</button>
      : <button type="button" className="mt-2 min-h-11 rounded-lg border p-3 font-bold" onClick={() => fullscreen.request()}>Enter Browser Fullscreen</button>}
    <p className="mt-2 text-sm">Calibration follows the actual browser mode shown above. If fullscreen exits, the regular Safari profile applies.</p>
  </section>;
  if (!loaded || !song.lyrics?.trim()) return <main id="smart-lyric-paging-display" className="min-h-screen bg-slate-950 p-6 text-white">
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
    fullscreenControls={controls} returnLabel="Back to Live Mode" startLabel={fullscreen.status.active ? "RESUME LYRICS IN FULLSCREEN" : "RESUME LYRICS"}
    notice={storageUnavailable ? "Settings storage is unavailable. Changes apply for this session only." : undefined} />;
  return <>
    <SmartLyricPagingDisplay key={song.id} config={config} lyricText={song.lyrics} fullscreenLabel={fullscreen.status.label}
      onReturn={close} onCalibrate={() => flushSync(() => setCalibrating(true))} onMeasurement={record} />
    {!fullscreen.status.active && <div className="pointer-events-none fixed bottom-3 right-3 z-20 max-w-xs rounded-xl bg-black/90 p-2 text-xs text-white">
      <button type="button" className="pointer-events-auto min-h-11 rounded-lg border border-white/30 px-3 font-bold" onClick={() => fullscreen.request()}>Enter Browser Fullscreen</button>
      <p role="status" className="mt-1">{fullscreen.status.message}</p>
    </div>}
  </>;
}

"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createWedgePageReset, resetWedgePosition } from "@/lib/lyric-wedge";
import type { WedgeSong } from "./lyric-wedge";
import { SmartLyricPagingDisplay, type PagingMeasurement, type SmartPagingConfig } from "./footswitch-smart-paging-display";
import { SmartLyricPagingSetup } from "./footswitch-smart-paging-test";
import { calibrationProfileNeedsTesting, orientationCalibration, updateOrientationCalibration } from "./footswitch-diagnostic-settings";
import { splitLyricSections } from "./footswitch-lyric-paging";
import { applyDocumentSnap } from "./footswitch-document-snap";
import { useWedgeSettings } from "./lyric-wedge-settings";

export function LyricWedgePaging({ song, setupControls, fullscreen, connection, status }: {
  song: WedgeSong | null; setupControls: ReactNode; fullscreen: boolean; connection: string; status?: string;
}) {
  const { settings, setSettings, orientation, loaded, storageUnavailable } = useWedgeSettings();
  // Auto-open on initial following; Close/Calibrate explicitly select setup.
  const [displayActive, setDisplayActive] = useState(true);
  const [history, setHistory] = useState<PagingMeasurement[]>([]);
  const songId = song?.id;
  const reset = useMemo(() => createWedgePageReset(songId), [songId]);
  const config = useMemo<SmartPagingConfig>(() => ({ sample: "realistic", source: "stageflow",
    songId: song?.id, title: song?.title, songKey: song?.key, preferredSize: settings.preferredSize,
    calibration: orientationCalibration(settings, orientation, fullscreen), orientation, fullscreen,
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
    sourceControls={setupControls} sectionCount={splitLyricSections(song.lyrics ?? "").length}
    missingLyrics={!song.lyrics?.trim()} needsCalibration={calibrationProfileNeedsTesting(settings, orientation, fullscreen)}
    notice={storageUnavailable ? "Wedge settings storage is unavailable. Changes apply for this session only." : "Calibration is saved independently on this Lyric Wedge device."}
    onConfig={(next) => setSettings((current) => {
      const changed = { ...current, preferredSize: next.preferredSize };
      return next.calibration === orientationCalibration(current, orientation, fullscreen)
        ? changed : updateOrientationCalibration(changed, orientation, next.calibration, fullscreen);
    })}
    onReset={() => setSettings((current) => updateOrientationCalibration(current, orientation, 0, fullscreen))} />;
  if (!song.lyrics?.trim()) return <main className="min-h-screen bg-[#050505] p-6 text-white" aria-label="Lyric Wedge">
    <button type="button" onClick={setup} className="min-h-11 rounded-lg border px-4">Wedge Setup</button>
    <h1 className="mt-6 text-3xl font-bold">{song.title}</h1>
    {song.key && <p className="mt-2 text-xl">KEY: {song.key}</p>}
    <p role="status" className="mt-8 text-2xl">No lyrics available for this song.</p>
  </main>;
  return <>
    <SmartLyricPagingDisplay key={song.id} config={config} lyricText={song.lyrics}
      onReturn={setup} onCalibrate={setup} onMeasurement={record} />
    {connection !== "connected" && <p role="status" className="pointer-events-none fixed bottom-2 right-2 z-20 rounded bg-black/90 px-2 py-1 text-xs text-white">{connection === "disconnected" ? "Disconnected — keeping last song" : "Connecting…"}</p>}
  </>;
}

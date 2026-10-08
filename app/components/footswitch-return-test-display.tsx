"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { SmartLyricPagingDisplay } from "./footswitch-smart-paging-display";
import { observeReturnTrigger, type ReturnTriggerSnapshot } from "./footswitch-return-trigger";

// Only the standalone test mounts this wrapper; the shared lyric display is unchanged.
export function FootswitchReturnTestDisplay(props: ComponentProps<typeof SmartLyricPagingDisplay>) {
  const zone = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<ReturnTriggerSnapshot | null>(null);
  useEffect(() => {
    if (!zone.current) return;
    return observeReturnTrigger(window, document, zone.current, setSnapshot);
  }, []);
  return <>
    <SmartLyricPagingDisplay {...props} />
    <div className="bg-slate-950 px-6 py-5 text-center text-white" aria-label="End of song">
      <p className="font-bold">END OF SONG</p>
      <p className="mt-1 text-sm">↓ PRESS AGAIN TO RETURN TO SETLIST</p>
      <p className="mt-2 text-xs text-white/60">Experiment only — the viewer will stay open.</p>
    </div>
    <div ref={zone} data-footswitch-return-zone className="min-h-screen bg-slate-950 px-6 py-8 text-center text-white" style={{ minHeight: "100dvh" }}>
      <p role="status" className="text-xl font-bold">{snapshot?.triggered ? "RETURN TO SETLIST TRIGGER DETECTED" : "Return-to-setlist scroll test zone"}</p>
      <p className="mt-3 text-sm">This test never closes lyrics. Use × Close to leave.</p>
      <aside aria-label="Return to setlist experiment diagnostics" className="mx-auto mt-5 max-w-md rounded-lg border border-white/20 p-3 text-left font-mono text-sm text-white">
        <p>Scroll: {snapshot ? `${snapshot.scrollY.toFixed(1)}px` : "Waiting"}</p>
        <p>Zone start: {snapshot?.zoneStart != null ? `${snapshot.zoneStart.toFixed(1)}px` : "Waiting for lyrics"}</p>
        <p>Final page reached: {snapshot?.finalReached ? "Yes" : "No"}</p>
        <p>Zone entered: {snapshot?.zoneEntered ? "Yes" : "No"}</p>
        <p>Trigger fired: {snapshot?.triggered ? "Yes — viewer stays open" : "No"}</p>
      </aside>
    </div>
  </>;
}

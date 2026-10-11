"use client";

import { useEffect, useRef, useState } from "react";
import { createIsolatedLyricSyncClient, createLyricSyncPublisher, followLyricSync } from "@/lib/lyric-sync-client";
import { alignWedgeLyrics, lyricRevision, observeSemanticLyrics, readLyricPosition } from "@/lib/lyric-sync-layout";
import type { LyricStateMessage } from "@/lib/lyric-follow-protocol";

async function api(action: string, showId: string, body?: Record<string, unknown>) {
  const read = action === "status" || action === "snapshot";
  const response = await fetch(`/api/lyric-sync/${action}${read ? `?showId=${encodeURIComponent(showId)}` : ""}`, {
    method: read ? "GET" : "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8000),
    ...(read ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ showId, ...body }) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Lyric Sync unavailable");
  return result;
}
export function useLyricSyncLeader(showId: string | undefined, permitted: boolean,
  song: { id: string; lyrics: string | null } | null, opened: boolean) {
  const [status, setStatus] = useState("Off"), [active, setActive] = useState(false);
  const publisher = useRef<ReturnType<typeof createLyricSyncPublisher> | null>(null);
  const viewer = useRef(""), previousOpen = useRef(false), epoch = useRef(0);
  const needsRecovery = useRef(false);
  const invalidate = () => { epoch.current++; publisher.current?.destroy(); publisher.current = null; };
  const activate = (result: { snapshot: { payload: string } }) => {
    if (!showId) return;
    const state = JSON.parse(result.snapshot.payload).state;
    needsRecovery.current = false;
    publisher.current?.destroy();
    publisher.current = createLyricSyncPublisher(showId, state.sequence, next => {
      if (next === "broadcast-accepted") setStatus("Active");
      else { needsRecovery.current = true; setStatus("Disconnected — reconnecting"); setActive(false); }
    });
    setActive(true); setStatus("Active");
  };
  useEffect(() => {
    const current = ++epoch.current;
    if (showId && permitted) void api("status", showId).then(result => { if (current === epoch.current) activate(result); }).catch(() => {});
    let pending = false;
    const resume = () => {
      if (!showId || !permitted || !needsRecovery.current || pending) return;
      pending = true; const generation = epoch.current;
      void api("status", showId).then(result => { if (generation === epoch.current) activate(result); })
        .catch(() => {}).finally(() => { pending = false; });
    };
    window.addEventListener("online", resume); window.addEventListener("pageshow", resume);
    const timer = setInterval(resume, 15_000);
    return () => { invalidate(); clearInterval(timer); window.removeEventListener("online", resume); window.removeEventListener("pageshow", resume); };
    // A show change destroys the old publisher; ordinary song changes do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId, permitted]);
  useEffect(() => {
    if (!active || !showId || !permitted) return;
    const current = epoch.current;
    const timer = setInterval(() => { void api("renew", showId).catch(() => {
      if (current !== epoch.current) return;
      needsRecovery.current = true; publisher.current?.destroy(); setActive(false); setStatus("Disconnected — reconnecting");
    }); }, 90_000);
    return () => clearInterval(timer);
  }, [active, showId, permitted]);
  useEffect(() => {
    if (!active || !permitted) return;
    let disposed = false, prior = "", stop: (() => void) | undefined;
    if ((opened && !previousOpen.current) || !viewer.current) viewer.current = crypto.randomUUID();
    previousOpen.current = opened;
    const sendClosed = () => publisher.current?.publish({ viewerSessionId: viewer.current, state: "closed",
      setlistEntryId: null, lyricsRevision: null, position: null });
    if (!opened || !song?.lyrics?.trim()) { sendClosed(); return; }
    void lyricRevision(song.lyrics).then(revision => {
      if (disposed) return;
      stop = observeSemanticLyrics(document, window, () => {
        const calibrating = Boolean(document.getElementById("smart-lyric-paging-setup"));
        const state = { viewerSessionId: viewer.current, state: calibrating ? "calibrating" : "open",
          setlistEntryId: song.id, lyricsRevision: revision, position: calibrating ? null : readLyricPosition(document, window) };
        const signature = JSON.stringify(state);
        if (signature !== prior) { prior = signature; publisher.current?.publish(state); }
      });
    }).catch(() => { if (!disposed) setStatus("Lyric position unavailable"); });
    return () => { disposed = true; stop?.(); };
  }, [active, opened, permitted, song?.id, song?.lyrics]);
  return { status, active,
    async start(pin: string) {
      if (!showId || !permitted) return;
      const current = ++epoch.current; setStatus("Starting…");
      try { const result = await api("start", showId, { pin }); if (current === epoch.current) activate(result); }
      catch (error) {
        // An owner recovering a lost response may resume via its existing cookie;
        // a different iPad cannot pass this ownership-checked status request.
        try { const result = await api("status", showId); if (current === epoch.current) activate(result); }
        catch { if (current === epoch.current) setStatus(error instanceof Error ? error.message : "Lyric Sync unavailable"); }
      }
    },
    async end() {
      if (!showId) return;
      try { await api("end", showId); needsRecovery.current = false; publisher.current?.destroy(); setActive(false); setStatus("Off"); }
      catch { setStatus("Could not end sync — retry"); }
    },
  };
}
export function LyricSyncControls({ sync }: { sync: ReturnType<typeof useLyricSyncLeader> }) {
  const [enterPin, setEnterPin] = useState(false), [pin, setPin] = useState("");
  return <div className="inline-flex flex-wrap items-center gap-2 text-xs" aria-label="Lyric Sync controls">
    <button type="button" onClick={() => { if (sync.active) void sync.end(); else setEnterPin(value => !value); }} className="min-h-11 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 font-semibold text-white">{sync.active ? "End Lyric Sync" : "Start Lyric Sync"}</button>
    <span role="status" className="max-w-56 whitespace-normal">Lyric Sync: {sync.status}</span>
    {enterPin && !sync.active && <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); const value = pin; setPin(""); setEnterPin(false); void sync.start(value); }}>
      <input type="password" inputMode="numeric" autoComplete="off" aria-label="Lyric Sync PIN" value={pin} maxLength={12} onChange={event => setPin(event.target.value)} className="min-h-11 w-28 rounded border bg-slate-950 px-2 text-white" />
      <button type="submit" className="min-h-11 rounded border px-3">Start</button>
    </form>}
  </div>;
}

export function useWedgeLyricSync(showId: string | undefined, song: { id: string; lyrics: string | null } | null, reveal: () => void) {
  const [status, setStatus] = useState(""), [message, setMessage] = useState<LyricStateMessage | null>(null);
  const [localRevision, setLocalRevision] = useState<string | undefined>(undefined);
  const currentSong = useRef(song), revision = useRef<string | undefined>(undefined), open = useRef(reveal);
  useEffect(() => { currentSong.current = song; open.current = reveal; }, [song, reveal]);
  useEffect(() => {
    let disposed = false; revision.current = undefined;
    void lyricRevision(song?.lyrics ?? "").then(value => { if (!disposed) { revision.current = value; setLocalRevision(value); } }).catch(() => {});
    return () => { disposed = true; };
  }, [song?.id, song?.lyrics]);
  useEffect(() => {
    if (!showId) return;
    let disposed = false, stop: (() => void) | undefined, pending = false;
    // Check readiness BEFORE opening any new Supabase subscription.
    const connect = () => {
      if (disposed || pending || stop) return;
      pending = true;
      void api("snapshot", showId).then(() => {
        if (disposed) return;
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) return;
        const client = createIsolatedLyricSyncClient(url, key);
        const follower = followLyricSync({ client, showId, revision: () => revision.current,
          onState(next) { setMessage(next); if (next.state === "open" && next.setlistEntryId === currentSong.current?.id) open.current(); },
          onStatus(next) { setStatus(next); if (next === "waiting") setMessage(null); } });
        stop = () => { follower.destroy(); void client.realtime.disconnect(); };
      }).catch(() => {}).finally(() => { pending = false; }); // Missing config preserves Wedge Flow.
    };
    connect();
    window.addEventListener("online", connect); window.addEventListener("pageshow", connect);
    const timer = setInterval(connect, 15_000);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener("online", connect); window.removeEventListener("pageshow", connect); stop?.(); };
  }, [showId]);
  useEffect(() => {
    if (!message || message.state !== "open" || message.setlistEntryId !== song?.id || !song?.lyrics || status !== "connected") return;
    let disposed = false, stop: (() => void) | undefined;
    void lyricRevision(song.lyrics).then(value => {
      if (disposed || value !== message.lyricsRevision || !message.position) return;
      open.current();
      stop = observeSemanticLyrics(document, window, () => { if (!disposed) alignWedgeLyrics(document, window, message.position!); });
    }).catch(() => {});
    return () => { disposed = true; stop?.(); };
  }, [message, song?.id, song?.lyrics, status]);
  const following = message?.state === "open" && message.setlistEntryId === song?.id && message.lyricsRevision === localRevision && status === "connected";
  return { status, following };
}

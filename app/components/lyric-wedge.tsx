"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveSongKey, resolveSongLyrics, resolveSongTitle, type SongResolverRecord } from "@/lib/song-resolvers";
import { createWedgeWakeLock, followWedgeState, resetWedgePosition, selectedWedgeEntry, sortWedgeEntries, type WedgeConnection, type WedgeLiveState } from "@/lib/lyric-wedge";
import { useDiagnosticFullscreen } from "./footswitch-fullscreen";

type Entry = SongResolverRecord & { id: string; section: string | null; position: number; created_at: string };
export type WedgeSong = { id: string; title: string; key: string | null; lyrics: string | null };

export function WedgeLyrics({ song }: { song: WedgeSong }) {
  useEffect(() => { resetWedgePosition(window); }, [song.id]);
  return <article className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 sm:px-10">
    <h1 className="break-words text-center text-3xl font-bold sm:text-4xl">{song.title}</h1>
    {song.key && <p className="mt-2 text-center text-xl font-bold text-slate-300">KEY: {song.key}</p>}
    {song.lyrics?.trim()
      ? <div aria-label="Song lyrics" className="mt-10 whitespace-pre-wrap break-words font-semibold leading-relaxed [overflow-wrap:anywhere]" style={{ fontSize: "clamp(32px, 4.5vw, 56px)" }}>{song.lyrics}</div>
      : <p role="status" className="mt-12 text-center text-2xl text-slate-300">No lyrics available for this song.</p>}
  </article>;
}

export function LyricWedge({ showSlug }: { showSlug: string }) {
  const [songs, setSongs] = useState<WedgeSong[]>([]);
  const [state, setState] = useState<WedgeLiveState | null>(null);
  const [showName, setShowName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<WedgeConnection>("connecting");
  const [awake, setAwake] = useState(false);
  const [wakeMessage, setWakeMessage] = useState("Keep awake off");
  const wake = useRef<ReturnType<typeof createWedgeWakeLock> | null>(null);
  const fullscreen = useDiagnosticFullscreen();
  const song = selectedWedgeEntry(songs, state);

  useEffect(() => {
    const controller = createWedgeWakeLock(document, navigator, setWakeMessage);
    wake.current = controller;
    return () => { controller.destroy(); wake.current = null; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    async function load() {
      try {
        const supabase = createClient();
        const { data: show, error: showError } = await supabase.from("shows").select("id, name").eq("slug", showSlug).maybeSingle();
        if (showError) throw showError;
        if (!show) throw new Error("Show not found.");
        const { data: entries, error: entriesError } = await supabase.from("setlist_entries").select(`
          id, section, position, created_at, custom_title, key_override,
          library_song:song_id (title, key, lyrics),
          guest_song:guest_song_id (title, key, lyrics)
        `).eq("show_id", show.id);
        if (entriesError) throw entriesError;
        if (cancelled) return;
        setShowName(show.name);
        setSongs(sortWedgeEntries((entries ?? []) as Entry[]).map((entry) => ({
          id: entry.id, title: resolveSongTitle(entry), key: resolveSongKey(entry), lyrics: resolveSongLyrics(entry),
        })));
        const follower = followWedgeState({
          read: async () => {
            const { data, error: readError } = await supabase.from("live_show_state")
              .select("current_song_index, updated_at").eq("show_id", show.id).maybeSingle();
            if (readError) throw readError;
            return data;
          },
          subscribe: (receive, status) => {
            const channel = supabase.channel(`lyric-wedge:${show.id}`)
              .on("postgres_changes", { event: "*", schema: "public", table: "live_show_state", filter: `show_id=eq.${show.id}` },
                (payload: { eventType: string; new: unknown }) => receive(payload.eventType === "DELETE" ? null : payload.new as WedgeLiveState))
              .subscribe(status);
            return () => { void supabase.removeChannel(channel); };
          },
        }, setState, setConnection);
        const online = () => { void follower.reconcile(); };
        const offline = () => follower.offline();
        const visible = () => { if (document.visibilityState === "visible") online(); };
        window.addEventListener("online", online);
        window.addEventListener("offline", offline);
        window.addEventListener("pageshow", online);
        document.addEventListener("visibilitychange", visible);
        if (!navigator.onLine) offline();
        stop = () => {
          follower.destroy();
          window.removeEventListener("online", online);
          window.removeEventListener("offline", offline);
          window.removeEventListener("pageshow", online);
          document.removeEventListener("visibilitychange", visible);
        };
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Could not load this show's lyrics. Check your connection and reload.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; stop?.(); };
  }, [showSlug]);

  return <main className="min-h-screen bg-[#050505] text-white" aria-label="Lyric Wedge" style={{ paddingInline: "max(0px, env(safe-area-inset-left), env(safe-area-inset-right))" }}>
    <details className="border-b border-white/15 bg-black px-4 py-3 text-sm">
      <summary className="min-h-11 cursor-pointer content-center text-slate-300">Lyric Wedge · Wedge Flow <span role="status" className="ml-3 text-xs">{connection === "connected" ? "Connected" : connection === "disconnected" ? "Disconnected — keeping last song" : "Connecting…"}</span></summary>
      <div className="space-y-4 py-3">
        <p>{showName}</p>
        <fieldset className="flex flex-wrap gap-4"><legend className="mb-2 font-bold">Operating mode</legend>
          <label><input type="radio" name="wedge-mode" checked readOnly className="mr-2" />Wedge Flow</label>
          <label className="text-slate-500"><input type="radio" name="wedge-mode" disabled className="mr-2" />Follow the Leader — Coming Soon</label>
        </fieldset>
        <p className="text-slate-300">Automatically follows the current song. Scroll by touch or mouse for now; scrolling is independent of the leader.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={fullscreen.status.label === "Unavailable"} onClick={() => { if (fullscreen.status.active) void fullscreen.close(); else fullscreen.request(); }} className="min-h-11 rounded-lg border border-white/30 px-4 disabled:opacity-50">{fullscreen.status.active ? "Exit Fullscreen" : "Enter Fullscreen"}</button>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={awake} onChange={(event) => { setAwake(event.target.checked); if (event.target.checked) wake.current?.enable(); else wake.current?.disable(); }} />Keep screen awake</label>
        </div>
        <p role="status" className="text-xs text-slate-400">{fullscreen.status.message} · {wakeMessage}</p>
      </div>
    </details>
    {loading ? <p role="status" className="p-8 text-xl">Loading Lyric Wedge…</p>
      : error ? <p role="alert" className="p-8 text-xl">{error}</p>
      : !songs.length ? <p role="status" className="p-8 text-xl">No setlist songs for this show.</p>
      : song ? <WedgeLyrics song={song} />
      : <p role="status" className="p-8 text-xl">Waiting for the leader to select a song.</p>}
  </main>;
}

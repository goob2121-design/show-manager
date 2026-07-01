"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ShowRecord, SongTempo, SongType } from "@/lib/types";

const FONT_KEY = "stageflow_live_lyrics_font_size";
const MODE_KEY = "stageflow_live_lyrics_reading_mode";
const SPEED_KEY = "stageflow_live_lyrics_autoscroll_speed";
const DELAY_KEY = "stageflow_live_lyrics_autoscroll_delay";
const AUTOSTART_KEY = "stageflow_live_lyrics_autostart_scroll";
const INTRO_ENABLED_KEY = "stageflow_live_intro_auto_open_lyrics_enabled";
const INTRO_DELAY_KEY = "stageflow_live_intro_auto_open_lyrics_delay";
const SCROLL_DELAYS = [0, 3, 5, 10, 15, 20];
const INTRO_DELAYS = [0, 10, 20, 30, 45, 60, 90];
const SPEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const FONT_SIZES = [18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42];

type SectionKey = "set1" | "set2" | "encore" | "other";
type Status = "ready" | "attention" | "missing" | "na";
type JoinedSong = {
  id: string; title: string | null; key: string | null; sung_by: string | null; tempo: SongTempo | null; song_type: SongType | null;
  lyrics?: string | null; performance_flow?: string | null; song_intro_notes?: string | null; submitted_by_name?: string | null;
};
type Row = {
  id: string; show_id: string; section: string | null; position: number; source_type: string | null; song_id: string | null; guest_song_id: string | null;
  custom_title: string | null; performance_flow?: string | null; song_intro_notes?: string | null; created_at: string;
  library_song?: JoinedSong | JoinedSong[] | null; guest_song?: JoinedSong | JoinedSong[] | null;
};
type SetupSong = {
  id: string; section: SectionKey; songNumber: number; title: string; key: string | null; lead: string | null; songType: SongType | null;
  lyrics: string | null; performanceFlow: string; songIntroNotes: string;
};
type Settings = { autoStart: boolean; speed: number; delay: number; fontSize: number; reading: boolean; introAuto: boolean; introDelay: number };

function first<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function sec(value: string | null | undefined): SectionKey { return value === "set1" || value === "set2" || value === "encore" ? value : "other"; }
function secLabel(value: SectionKey) { return value === "set1" ? "Set 1" : value === "set2" ? "Set 2" : value === "encore" ? "Encore" : "Other"; }
function key(base: string, id: string) { return `${base}_${id}`; }
function read(base: string, id: string) { return window.localStorage.getItem(key(base, id)) ?? window.localStorage.getItem(base); }
function readBool(base: string, id: string, fallback: boolean) { const value = read(base, id); return value === null ? fallback : value === "true"; }
function readNum(base: string, id: string, fallback: number) { const value = read(base, id); const parsed = value ? Number.parseInt(value, 10) : Number.NaN; return Number.isFinite(parsed) ? parsed : fallback; }
function write(id: string, base: string, value: string | number | boolean) { window.localStorage.setItem(key(base, id), String(value)); }
function loadSettings(id: string): Settings { return { autoStart: readBool(AUTOSTART_KEY, id, false), speed: readNum(SPEED_KEY, id, 4), delay: readNum(DELAY_KEY, id, 3), fontSize: readNum(FONT_KEY, id, 28), reading: readBool(MODE_KEY, id, false), introAuto: readBool(INTRO_ENABLED_KEY, id, false), introDelay: readNum(INTRO_DELAY_KEY, id, 0) }; }
function saveSettings(id: string, s: Settings) { write(id, AUTOSTART_KEY, s.autoStart); write(id, SPEED_KEY, s.speed); write(id, DELAY_KEY, s.delay); write(id, FONT_KEY, s.fontSize); write(id, MODE_KEY, s.reading); write(id, INTRO_ENABLED_KEY, s.introAuto); write(id, INTRO_DELAY_KEY, s.introDelay); }
function normalize(row: Row, songNumber: number): SetupSong { const lib = first(row.library_song); const guest = first(row.guest_song); const section = sec(row.section); return { id: row.id, section, songNumber, title: row.custom_title?.trim() || lib?.title?.trim() || guest?.title?.trim() || "Untitled Song", key: lib?.key ?? guest?.key ?? null, lead: lib?.sung_by ?? guest?.sung_by ?? guest?.submitted_by_name ?? null, songType: lib?.song_type ?? guest?.song_type ?? null, lyrics: lib?.lyrics ?? guest?.lyrics ?? null, performanceFlow: row.performance_flow?.trim() || lib?.performance_flow?.trim() || "", songIntroNotes: row.song_intro_notes?.trim() || lib?.song_intro_notes?.trim() || "" }; }
function status(song: SetupSong, s: Settings): Status { const hasLyrics = Boolean(song.lyrics?.trim()); const hasFlow = Boolean(song.performanceFlow.trim()); const hasIntro = Boolean(song.songIntroNotes.trim()); if (song.songType === "instrumental" && !hasLyrics && !s.introAuto) return "na"; if (!hasLyrics) return "missing"; if (s.introAuto && !hasIntro) return "missing"; if (!hasFlow || (s.introAuto && s.introDelay <= 0)) return "attention"; return "ready"; }
function statusLabel(value: Status) { return value === "ready" ? "Ready" : value === "attention" ? "Needs Attention" : value === "missing" ? "Missing Content" : "Not Applicable"; }
function statusClass(value: Status) { return value === "ready" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : value === "attention" ? "border-amber-300 bg-amber-50 text-amber-800" : value === "missing" ? "border-rose-300 bg-rose-50 text-rose-800" : "border-slate-300 bg-slate-100 text-slate-700"; }
function formatDate(value: string | null) { if (!value) return "Date TBD"; const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? "Date TBD" : new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date); }
function Toggle({ label, enabled, onClick }: { label: string; enabled: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${enabled ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-stone-300 bg-white text-stone-700"}`}>{label}: {enabled ? "On" : "Off"}</button>; }

export function PerformanceSetupPage({ showSlug }: { showSlug: string }) {
  const [show, setShow] = useState<ShowRecord | null>(null);
  const [songs, setSongs] = useState<SetupSong[]>([]);
  const [settings, setSettings] = useState<Record<string, Settings>>({});
  const [flowDrafts, setFlowDrafts] = useState<Record<string, string>>({});
  const [introDrafts, setIntroDrafts] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<Settings>({ autoStart: false, speed: 4, delay: 3, fontSize: 28, reading: false, introAuto: false, introDelay: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<Settings | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true); setError(null);
      try {
        const supabase = createClient();
        const { data: showRow, error: showError } = await supabase.from("shows").select("*").eq("slug", showSlug).maybeSingle();
        if (showError) throw showError;
        if (!showRow) throw new Error("Show not found.");
        const { data, error: rowError } = await supabase.from("setlist_entries").select(`
          id, show_id, section, position, source_type, song_id, guest_song_id, custom_title, performance_flow, song_intro_notes, created_at,
          library_song:song_id (id, title, key, sung_by, tempo, song_type, performance_flow, song_intro_notes, lyrics),
          guest_song:guest_song_id (id, title, key, sung_by, tempo, song_type, lyrics, submitted_by_name)
        `).eq("show_id", showRow.id);
        if (rowError) throw rowError;
        const ordered = [...((data ?? []) as Row[])].sort((a, b) => {
          const sectionOrder: Record<SectionKey, number> = { set1: 0, set2: 1, encore: 2, other: 3 };
          const diff = sectionOrder[sec(a.section)] - sectionOrder[sec(b.section)];
          if (diff !== 0) return diff;
          if (a.position !== b.position) return a.position - b.position;
          return a.created_at.localeCompare(b.created_at);
        });
        const counts: Record<SectionKey, number> = { set1: 0, set2: 0, encore: 0, other: 0 };
        const nextSongs = ordered.map((row) => { const section = sec(row.section); counts[section] += 1; return normalize(row, counts[section]); });
        if (cancelled) return;
        setShow(showRow as ShowRecord); setSongs(nextSongs);
        setSettings(nextSongs.reduce<Record<string, Settings>>((out, song) => { out[song.id] = loadSettings(song.id); return out; }, {}));
        setFlowDrafts(nextSongs.reduce<Record<string, string>>((out, song) => { out[song.id] = song.performanceFlow; return out; }, {}));
        setIntroDrafts(nextSongs.reduce<Record<string, string>>((out, song) => { out[song.id] = song.songIntroNotes; return out; }, {}));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Performance Setup.");
      } finally { if (!cancelled) setIsLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [showSlug]);

  const grouped = useMemo(() => songs.reduce<Record<SectionKey, SetupSong[]>>((out, song) => { out[song.section].push(song); return out; }, { set1: [], set2: [], encore: [], other: [] }), [songs]);
  const summary = useMemo(() => songs.reduce<Record<Status, number>>((out, song) => { out[status(song, settings[song.id] ?? loadSettings(song.id))] += 1; return out; }, { ready: 0, attention: 0, missing: 0, na: 0 }), [settings, songs]);

  function updateSettings(id: string, updater: (current: Settings) => Settings) {
    setSettings((current) => { const next = updater(current[id] ?? loadSettings(id)); saveSettings(id, next); return { ...current, [id]: next }; });
  }
  function bulk(label: string, updater: (current: Settings) => Settings, filter?: (song: SetupSong) => boolean) {
    if (!window.confirm(`${label}? This updates saved Live Mode settings on this device.`)) return;
    setSettings((current) => { const next = { ...current }; for (const song of songs) { if (filter && !filter(song)) continue; next[song.id] = updater(next[song.id] ?? loadSettings(song.id)); saveSettings(song.id, next[song.id]); } return next; });
    setMessage(`${label} complete.`);
  }
  async function saveText(song: SetupSong) {
    setSavingId(song.id); setMessage(null); setError(null);
    try {
      const performance_flow = flowDrafts[song.id]?.trim() || null;
      const song_intro_notes = introDrafts[song.id]?.trim() || null;
      const { error: saveError } = await createClient().from("setlist_entries").update({ performance_flow, song_intro_notes }).eq("id", song.id);
      if (saveError) throw saveError;
      setSongs((current) => current.map((item) => item.id === song.id ? { ...item, performanceFlow: performance_flow ?? "", songIntroNotes: song_intro_notes ?? "" } : item));
      setMessage(`Saved setup notes for ${song.title}.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save setup notes."); }
    finally { setSavingId(null); }
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300">Performance Setup</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{show?.name ?? "Loading show..."}</h1>
            <p className="mt-2 text-sm font-semibold text-stone-600 dark:text-slate-300">{formatDate(show?.show_date ?? null)}</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600 dark:text-slate-300">Prepare Live Mode automation, lyrics, intros, and scrolling for the full show.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/${encodeURIComponent(showSlug)}?tab=rehearsal`} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100">Rehearsal</Link>
            <Link href={`/band/${encodeURIComponent(showSlug)}/live`} className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-100">Live Mode</Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100"><p className="text-3xl font-black">{summary.ready}</p><p className="text-sm font-bold">Ready</p></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-100"><p className="text-3xl font-black">{summary.attention}</p><p className="text-sm font-bold">Need Attention</p></div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100"><p className="text-3xl font-black">{summary.missing}</p><p className="text-sm font-bold">Missing Content</p></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"><p className="text-3xl font-black">{summary.na}</p><p className="text-sm font-bold">Not Applicable</p></div>
        </section>

        <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
          <h2 className="text-xl font-black">Defaults</h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-slate-300">Set preferred values, then apply them in bulk to this device's saved Live Mode settings.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <label className="text-sm font-bold">Font Size<select value={defaults.fontSize} onChange={(e) => setDefaults((c) => ({ ...c, fontSize: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950">{FONT_SIZES.map((v) => <option key={v} value={v}>{v}px</option>)}</select></label>
            <label className="text-sm font-bold">Reading Mode<select value={defaults.reading ? "reading" : "dark"} onChange={(e) => setDefaults((c) => ({ ...c, reading: e.target.value === "reading" }))} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950"><option value="dark">Dark</option><option value="reading">Reading</option></select></label>
            <label className="text-sm font-bold">Scroll Speed<select value={defaults.speed} onChange={(e) => setDefaults((c) => ({ ...c, speed: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950">{SPEEDS.map((v) => <option key={v} value={v}>Speed {v}</option>)}</select></label>
            <label className="text-sm font-bold">Scroll Delay<select value={defaults.delay} onChange={(e) => setDefaults((c) => ({ ...c, delay: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950">{SCROLL_DELAYS.map((v) => <option key={v} value={v}>{v}s</option>)}</select></label>
            <Toggle label="Auto Start Scroll" enabled={defaults.autoStart} onClick={() => setDefaults((c) => ({ ...c, autoStart: !c.autoStart }))} />
            <Toggle label="Intro Auto Open" enabled={defaults.introAuto} onClick={() => setDefaults((c) => ({ ...c, introAuto: !c.introAuto }))} />
            <label className="text-sm font-bold">Intro Delay<select value={defaults.introDelay} onChange={(e) => setDefaults((c) => ({ ...c, introDelay: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950">{INTRO_DELAYS.map((v) => <option key={v} value={v}>{v === 0 ? "Off" : `${v}s`}</option>)}</select></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => bulk("Apply Defaults to All Songs", () => defaults)} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">Apply Defaults to All Songs</button>
            <button type="button" onClick={() => bulk("Apply Font Size to All Songs", (c) => ({ ...c, fontSize: defaults.fontSize }))} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100">Apply Font Size to All Songs</button>
            <button type="button" onClick={() => bulk("Apply Reading Mode to All Songs", (c) => ({ ...c, reading: defaults.reading }))} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100">Apply Reading Mode to All Songs</button>
            <button type="button" onClick={() => bulk("Apply Auto Scroll Settings to Songs with Lyrics", (c) => ({ ...c, autoStart: defaults.autoStart, speed: defaults.speed, delay: defaults.delay }), (song) => Boolean(song.lyrics?.trim()))} className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-100">Apply Auto Scroll Settings to All Songs</button>
          </div>
        </section>

        {message ? <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100">{message}</div> : null}
        {error ? <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100">{error}</div> : null}

        {isLoading ? (
          <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center text-lg font-black text-stone-700 shadow-sm dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100">
            Loading Performance Setup...
          </div>
        ) : songs.length === 0 ? (
          <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center text-lg font-black text-stone-700 shadow-sm dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100">
            No setlist songs found for this show.
          </div>
        ) : (
          (["set1", "set2", "encore", "other"] as SectionKey[]).map((section) => (
            grouped[section].length > 0 ? (
              <section key={section} className="flex flex-col gap-3">
                <h2 className="px-1 text-lg font-black uppercase tracking-[0.18em] text-stone-600 dark:text-slate-300">{secLabel(section)}</h2>
                {grouped[section].map((song) => {
                  const s = settings[song.id] ?? loadSettings(song.id);
                  const songStatus = status(song, s);
                  const hasLyrics = Boolean(song.lyrics?.trim());
                  const hasIntro = Boolean((introDrafts[song.id] ?? song.songIntroNotes).trim());
                  const hasFlow = Boolean((flowDrafts[song.id] ?? song.performanceFlow).trim());
                  return (
                    <article key={song.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-4 dark:border-white/10">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-stone-500 dark:text-slate-400">{secLabel(song.section)} - Song {song.songNumber}</p>
                          <h3 className="mt-1 text-2xl font-black tracking-tight text-stone-950 dark:text-white">{song.title}</h3>
                          <p className="mt-1 text-sm font-semibold text-stone-600 dark:text-slate-300">
                            Key: {song.key || "TBD"} {song.lead ? ` - Lead: ${song.lead}` : ""}
                          </p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${statusClass(songStatus)}`}>{statusLabel(songStatus)}</span>
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_1.15fr]">
                        <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-white/10 dark:bg-slate-950/60">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-black uppercase tracking-[0.16em] text-stone-600 dark:text-slate-300">Song Intro</h4>
                            <span className={`rounded-full px-2 py-1 text-xs font-bold ${hasIntro ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-700"}`}>{hasIntro ? "Has Notes" : "No Notes"}</span>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                            <Toggle label="Auto Open Lyrics" enabled={s.introAuto} onClick={() => updateSettings(song.id, (c) => ({ ...c, introAuto: !c.introAuto }))} />
                            <label className="text-sm font-bold">Intro Delay
                              <select value={s.introDelay} onChange={(e) => updateSettings(song.id, (c) => ({ ...c, introDelay: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950">
                                {INTRO_DELAYS.map((v) => <option key={v} value={v}>{v === 0 ? "Off" : `${v}s`}</option>)}
                              </select>
                            </label>
                          </div>
                          <textarea value={introDrafts[song.id] ?? ""} onChange={(e) => setIntroDrafts((current) => ({ ...current, [song.id]: e.target.value }))} rows={7} placeholder="Intro notes, sponsor read, or MC setup..." className="mt-3 w-full rounded-2xl border border-stone-300 bg-white p-3 text-sm leading-6 text-stone-900 outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100" />
                        </section>

                        <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-white/10 dark:bg-slate-950/60">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-black uppercase tracking-[0.16em] text-stone-600 dark:text-slate-300">Lyrics Setup</h4>
                            <span className={`rounded-full px-2 py-1 text-xs font-bold ${hasLyrics ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{hasLyrics ? "Lyrics Ready" : "No Lyrics"}</span>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <Toggle label="Auto Start Scroll" enabled={s.autoStart} onClick={() => updateSettings(song.id, (c) => ({ ...c, autoStart: !c.autoStart }))} />
                            <label className="text-sm font-bold">Scroll Delay<select value={s.delay} onChange={(e) => updateSettings(song.id, (c) => ({ ...c, delay: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950">{SCROLL_DELAYS.map((v) => <option key={v} value={v}>{v}s</option>)}</select></label>
                            <label className="text-sm font-bold">Speed<select value={s.speed} onChange={(e) => updateSettings(song.id, (c) => ({ ...c, speed: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950">{SPEEDS.map((v) => <option key={v} value={v}>Speed {v}</option>)}</select></label>
                            <label className="text-sm font-bold">Font Size<select value={s.fontSize} onChange={(e) => updateSettings(song.id, (c) => ({ ...c, fontSize: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950">{FONT_SIZES.map((v) => <option key={v} value={v}>{v}px</option>)}</select></label>
                            <label className="text-sm font-bold sm:col-span-2">Mode<select value={s.reading ? "reading" : "dark"} onChange={(e) => updateSettings(song.id, (c) => ({ ...c, reading: e.target.value === "reading" }))} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950"><option value="dark">Dark Mode</option><option value="reading">Reading Mode</option></select></label>
                          </div>
                          <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-stone-600 dark:bg-white/5 dark:text-slate-300">Saved to Live Mode key: {song.id}</p>
                        </section>

                        <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-white/10 dark:bg-slate-950/60">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-black uppercase tracking-[0.16em] text-stone-600 dark:text-slate-300">Performance Flow / Break Order</h4>
                            <span className={`rounded-full px-2 py-1 text-xs font-bold ${hasFlow ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{hasFlow ? "Ready" : "Needs Flow"}</span>
                          </div>
                          <textarea value={flowDrafts[song.id] ?? ""} onChange={(e) => setFlowDrafts((current) => ({ ...current, [song.id]: e.target.value }))} rows={10} placeholder="Break order, solos, tags, repeats, endings..." className="mt-3 w-full rounded-2xl border border-stone-300 bg-white p-3 text-sm leading-6 text-stone-900 outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100" />
                        </section>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={() => saveText(song)} disabled={savingId === song.id} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">{savingId === song.id ? "Saving..." : "Save Intro and Flow"}</button>
                        <button type="button" onClick={() => { setCopied(s); setMessage(`Copied Live Mode settings from ${song.title}.`); }} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100">Copy Settings</button>
                        <button type="button" onClick={() => copied ? updateSettings(song.id, () => copied) : setError("Copy settings from a song first.")} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100">Paste Settings</button>
                      </div>
                    </article>
                  );
                })}
              </section>
            ) : null
          ))
        )}
      </div>
    </main>
  );
}

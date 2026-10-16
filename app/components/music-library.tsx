"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadMusicLibrary, type MusicLibrarySong } from "@/lib/music-library";
import { useLibrarySmartLyrics } from "./library-smart-lyrics";
import { PrintSongCatalogButton } from "./print-song-catalog-button";

export function MusicLibrary() {
  const [songs, setSongs] = useState<MusicLibrarySong[]>([]);
  const [query, setQuery] = useState("");
  const [tempo, setTempo] = useState("");
  const [songType, setSongType] = useState("");
  const [openLyrics, setOpenLyrics] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const smartLyrics = useLibrarySmartLyrics();
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await loadMusicLibrary(createClient());
        if (!cancelled) { setSongs(rows); setError(""); }
      } catch {
        if (!cancelled) setError("Could not load the Music Library. Please try again.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [reload]);
  const search = query.trim().toLocaleLowerCase();
  const filtered = songs.filter(song => (!tempo || song.tempo === tempo) && (!songType || song.song_type === songType)
    && (!search || [song.title, song.key].some(value => value?.toLocaleLowerCase().includes(search))));
  const button = "min-h-11 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-stone-100";
  if (smartLyrics.viewer) return smartLyrics.viewer;
  return <main className="min-h-screen bg-stone-100 p-4 text-stone-900 sm:p-8">
    <section className="mx-auto max-w-5xl space-y-5 rounded-3xl border border-stone-200 bg-white p-5 sm:p-8">
      <header className="space-y-3">
        <Link href="/shows" className="text-sm font-semibold text-emerald-700 underline">StageFlow</Link>
        <h1 className="text-3xl font-bold">Music Library</h1>
        <p className="text-sm text-stone-600">Choose a song and open Smart Lyrics. No show or setlist is required.</p>
        <PrintSongCatalogButton />
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-2 font-semibold">Search Songs<input className={button} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search titles or keys…" /></label>
        <label className="flex flex-col gap-2 font-semibold">Filter by Tempo<select aria-label="Filter by Tempo" className={button} value={tempo} onChange={event => setTempo(event.target.value)}><option value="">All tempos</option><option value="slow">Slow</option><option value="medium">Medium</option><option value="fast">Fast</option></select></label>
        <label className="flex flex-col gap-2 font-semibold">Filter by Song Type<select aria-label="Filter by Song Type" className={button} value={songType} onChange={event => setSongType(event.target.value)}><option value="">All song types</option><option value="vocal">Vocal</option><option value="instrumental">Instrumental</option></select></label>
      </div>
      {loading ? <p role="status">Loading Music Library…</p> : error ? <div role="alert"><p>{error}</p><button className={button} onClick={() => { setLoading(true); setReload(value => value + 1); }}>Try Again</button></div> : <>
        <p role="status" className="text-sm text-stone-600">{filtered.length} of {songs.length} songs</p>
        {!filtered.length && <p>No songs match your search and filters.</p>}
        {filtered.map(song => <article key={song.id} className="rounded-2xl border border-stone-200 p-4">
          <h2 className="text-xl font-semibold">{song.title}</h2>
          <p className="mt-1 text-sm text-stone-600">{[song.key ? `Key: ${song.key}` : null, song.tempo, song.song_type].filter(Boolean).join(" · ")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={button} onClick={() => setOpenLyrics(openLyrics === song.id ? null : song.id)}>{openLyrics === song.id ? "Hide Lyrics" : "View Lyrics"}</button>
            <button id={`music-smart-lyrics-${song.id}`} type="button" className={button} onClick={() => smartLyrics.open({ id: song.id, title: song.title, lyrics: song.lyrics, key: song.key, performanceFlow: song.default_performance_flow ?? song.performance_flow }, `music-smart-lyrics-${song.id}`)}>Smart Lyrics</button>
          </div>
          {openLyrics === song.id && <p className="mt-3 whitespace-pre-wrap">{song.lyrics?.trim() ? song.lyrics : "No lyrics available for this song."}</p>}
        </article>)}
      </>}
    </section>
  </main>;
}

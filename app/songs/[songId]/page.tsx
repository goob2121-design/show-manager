import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SongRecord } from "@/lib/types";

const SONG_AUDIO_BUCKET = "promo-materials";
const MP3_PATH_MARKER_PATTERN = /\[\[MP3_PATH:([^\]]+)\]\]/;

type SharedSongRecord = SongRecord & {
  mp3_path?: string | null;
  mp3_url?: string | null;
  audio_url?: string | null;
  audio_file_url?: string | null;
  file_url?: string | null;
};

function extractMp3PathFromNotes(notes: string | null | undefined) {
  const match = notes?.match(MP3_PATH_MARKER_PATTERN);
  return match?.[1] ?? null;
}

function stripMp3MarkerFromNotes(notes: string | null | undefined) {
  if (!notes) {
    return null;
  }

  const cleanedNotes = notes.replace(MP3_PATH_MARKER_PATTERN, "").trim();
  return cleanedNotes || null;
}

function formatSongValue(value: string | null | undefined, fallback = "Not set") {
  if (!value?.trim()) {
    return fallback;
  }

  return value;
}

function resolveSongAudioValue(song: SharedSongRecord) {
  return (
    song.mp3_url?.trim() ||
    song.audio_url?.trim() ||
    song.audio_file_url?.trim() ||
    song.file_url?.trim() ||
    song.mp3_path?.trim() ||
    extractMp3PathFromNotes(song.notes) ||
    null
  );
}

function resolveSongAudioUrl(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  song: SharedSongRecord,
) {
  const audioValue = resolveSongAudioValue(song);

  if (!audioValue) {
    return null;
  }

  if (/^https?:\/\//i.test(audioValue)) {
    return audioValue;
  }

  return supabase.storage.from(SONG_AUDIO_BUCKET).getPublicUrl(audioValue).data.publicUrl || null;
}

type SongSharePageProps = {
  params: Promise<{ songId: string }>;
};

export default async function SongSharePage({ params }: SongSharePageProps) {
  const { songId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("songs").select("*").eq("id", songId).maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    notFound();
  }

  const song = data as SharedSongRecord;
  const notes = stripMp3MarkerFromNotes(song.notes);
  const lyrics = song.lyrics?.trim() || null;
  const audioUrl = resolveSongAudioUrl(supabase, song);

  return (
    <main className="min-h-screen bg-gradient-to-b from-stone-100 via-stone-50 to-stone-100 px-4 py-8 text-stone-900 sm:px-6 sm:py-10">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-stone-900 px-6 py-8 text-white sm:px-8">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-emerald-100">
                Song Library
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{song.title}</h1>
              <p className="text-sm leading-6 text-emerald-50/90 sm:text-base">
                Read-only song details for sharing and quick lyric review.
              </p>
            </div>
          </div>

          <div className="grid gap-3 border-t border-stone-200 bg-stone-50/70 px-6 py-5 sm:grid-cols-3 sm:px-8">
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Key</p>
              <p className="mt-2 text-sm font-semibold text-stone-900">
                {formatSongValue(song.key)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Tempo</p>
              <p className="mt-2 text-sm font-semibold capitalize text-stone-900">
                {formatSongValue(song.tempo)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Song Type
              </p>
              <p className="mt-2 text-sm font-semibold capitalize text-stone-900">
                {formatSongValue(song.song_type)}
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-6">
            {audioUrl ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Audio
                </p>
                <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                  <audio controls preload="none" src={audioUrl} className="w-full">
                    Your browser does not support audio playback.
                  </audio>
                </div>
              </div>
            ) : null}

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Notes</p>
              <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm leading-6 text-stone-700">
                {notes ? <p className="whitespace-pre-wrap">{notes}</p> : <p>No notes added yet.</p>}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Lyrics
              </p>
              <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm leading-7 text-stone-700">
                {lyrics ? (
                  <p className="whitespace-pre-wrap">{lyrics}</p>
                ) : (
                  <p>No lyrics added.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

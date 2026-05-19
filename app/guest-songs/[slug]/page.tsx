import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getShowNameBySlug } from "@/lib/route-metadata";
import { notFound } from "next/navigation";
import { Fragment } from "react";

const SONG_AUDIO_BUCKET = "promo-materials";
const mp3MarkerPattern = /\[\[MP3_PATH:(.+?)\]\]/i;
const urlPattern = /https?:\/\/[^\s<>"']+/gi;
const urlOnlyPattern = /^https?:\/\/[^\s]+$/;

type GuestSongsPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: GuestSongsPageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const showName = await getShowNameBySlug(slug);
    return {
      title: showName ? `Guest Songs | ${showName}` : "Guest Songs | StageFlow",
    };
  } catch {
    return {
      title: "Guest Songs | StageFlow",
    };
  }
}

type GuestSongsShow = {
  id: string;
  slug: string;
  name: string;
  show_date: string | null;
};

type GuestSongRow = {
  id: string;
  show_id: string;
  title: string;
  key: string | null;
  tempo: string | null;
  song_type: string | null;
  notes: string | null;
  lyrics: string | null;
  submitted_by_name: string | null;
  created_at: string;
};

function formatShowDate(value: string | null) {
  if (!value) {
    return "Date TBD";
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function stripMp3MarkerFromNotes(notes: string | null) {
  if (!notes) {
    return null;
  }

  const cleaned = notes.replace(mp3MarkerPattern, "").trim();
  return cleaned || null;
}

function extractMp3PathFromNotes(notes: string | null) {
  if (!notes) {
    return null;
  }

  const match = notes.match(mp3MarkerPattern);
  return match?.[1]?.trim() || null;
}

function extractExternalLinks(notes: string | null) {
  const matches = notes?.match(urlPattern) ?? [];
  return Array.from(new Set(matches.map((url) => url.trim()).filter(Boolean)));
}

function getLinkLabel(url: string) {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) {
    return "YouTube Link";
  }

  if (
    lowerUrl.endsWith(".pdf") ||
    lowerUrl.endsWith(".jpg") ||
    lowerUrl.endsWith(".jpeg") ||
    lowerUrl.endsWith(".png") ||
    lowerUrl.endsWith(".doc") ||
    lowerUrl.endsWith(".docx")
  ) {
    return "File Link";
  }

  if (lowerUrl.includes("chart")) {
    return "Chart Link";
  }

  return "Reference Link";
}

function renderTextWithLinks(text: string | null | undefined) {
  const value = text ?? "";

  return value.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (!part) {
      return null;
    }

    if (urlOnlyPattern.test(part)) {
      return (
        <a
          key={`${part}-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-emerald-700 underline"
        >
          {part}
        </a>
      );
    }

    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

async function loadShow(slug: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("shows")
    .select("id, slug, name, show_date")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as GuestSongsShow | null;
}

async function loadGuestSongs(showId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("show_guest_songs")
    .select("*")
    .eq("show_id", showId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const songs = (data ?? []) as GuestSongRow[];

  return Promise.all(
    songs.map(async (song) => {
      const mp3Path = extractMp3PathFromNotes(song.notes);
      const mp3Url = mp3Path
        ? (await supabase.storage.from(SONG_AUDIO_BUCKET).getPublicUrl(mp3Path)).data.publicUrl || null
        : null;

      return {
        ...song,
        displayNotes: stripMp3MarkerFromNotes(song.notes),
        mp3Url,
        externalLinks: extractExternalLinks(song.notes),
      };
    }),
  );
}

export default async function GuestSongsPage({ params }: GuestSongsPageProps) {
  const { slug } = await params;
  const show = await loadShow(slug);

  if (!show) {
    notFound();
  }

  const guestSongs = await loadGuestSongs(show.id);
  const groupedSongs = guestSongs.reduce<
    Array<{ guestName: string; songs: typeof guestSongs }>
  >((groups, song) => {
    const guestName = song.submitted_by_name?.trim() || "Guest Submission";
    const existingGroup = groups.find((group) => group.guestName === guestName);

    if (existingGroup) {
      existingGroup.songs.push(song);
      return groups;
    }

    groups.push({ guestName, songs: [song] });
    return groups;
  }, []);

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-3xl border border-stone-200 bg-white px-5 py-6 shadow-sm print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
          <div className="flex flex-col gap-2 border-b border-stone-200 pb-5 print:pb-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
              Guest Submitted Songs
            </p>
            <h1 className="text-3xl font-semibold text-stone-950">{show.name}</h1>
            <p className="text-sm text-stone-600">{formatShowDate(show.show_date)}</p>
          </div>

          {groupedSongs.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-sm text-stone-500 print:mt-5">
              No guest-submitted songs have been added for this show yet.
            </div>
          ) : (
            <div className="mt-6 grid gap-5 print:mt-5">
              {groupedSongs.map((group) => (
                <section
                  key={group.guestName}
                  className="rounded-2xl border border-stone-200 bg-stone-50 p-4 print:break-inside-avoid print:rounded-none print:border print:border-stone-200"
                >
                  <div className="border-b border-stone-200 pb-3">
                    <h2 className="text-lg font-semibold text-stone-950">{group.guestName}</h2>
                    <p className="text-sm text-stone-600">
                      {group.songs.length} submitted song{group.songs.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {group.songs.map((song) => (
                      <article
                        key={song.id}
                        className="rounded-2xl border border-stone-200 bg-white px-4 py-4 print:break-inside-avoid"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="text-base font-semibold text-stone-950">{song.title}</h3>
                            <p className="text-sm text-stone-600">
                              {song.submitted_by_name?.trim() || "Guest Submission"}
                              {song.key ? ` • Key: ${song.key}` : ""}
                              {song.tempo ? ` • Tempo: ${song.tempo}` : ""}
                              {song.song_type ? ` • ${song.song_type}` : ""}
                            </p>
                          </div>
                        </div>

                        {song.displayNotes ? (
                          <div className="mt-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                              Notes
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
                              {renderTextWithLinks(song.displayNotes)}
                            </p>
                          </div>
                        ) : null}

                        {song.mp3Url || song.externalLinks.length > 0 ? (
                          <div className="mt-4 flex flex-wrap gap-2 print:gap-3">
                            {song.mp3Url ? (
                              <a
                                href={song.mp3Url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 print:border-stone-300 print:bg-white print:text-stone-800"
                              >
                                MP3 / Audio Link
                              </a>
                            ) : null}

                            {song.externalLinks.map((url) => (
                              <a
                                key={`${song.id}-${url}`}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 print:bg-white"
                              >
                                {getLinkLabel(url)}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

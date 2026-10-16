import type { createClient } from "@/lib/supabase/client";
import type { SongRecord } from "@/lib/types";

export type MusicLibrarySong = Pick<SongRecord, "id" | "title" | "key" | "tempo" | "song_type" | "performance_flow" | "default_performance_flow"> & { lyrics: string | null };

export async function loadMusicLibrary(client: ReturnType<typeof createClient>) {
  const songs: MusicLibrarySong[] = [];
  for (let offset = 0; ; offset += 500) {
    // Read the reusable library only, independent of guest songs and show assignments.
    const { data, error } = await client.from("songs")
      .select("id,title,key,lyrics,tempo,song_type,performance_flow,default_performance_flow")
      .order("id", { ascending: true }).range(offset, offset + 499);
    if (error) throw error;
    if (!data) throw new Error("The Music Library returned no data.");
    songs.push(...data as MusicLibrarySong[]);
    if (data.length < 500) return songs.sort((a, b) => a.title.localeCompare(b.title));
  }
}

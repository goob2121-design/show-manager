import type { createClient } from "@/lib/supabase/client";
import type { SongRecord, ShowGuestSong } from "@/lib/types";
import type { FootswitchSong } from "./footswitch-song-source";

// Same browser/RLS access and tables as ShowPage's Song Library and guest songs.
// Pagination avoids silently limiting the diagnostic to Supabase's first batch.
export async function loadFootswitchSongLibrary(client: ReturnType<typeof createClient>, showId?: string) {
  const readLibrary = async () => {
    const rows: SongRecord[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.from("songs").select("*").order("title", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 999);
      if (error) throw new Error(`Could not load StageFlow song library: ${error.message}`);
      rows.push(...(data ?? []) as SongRecord[]);
      if ((data?.length ?? 0) < 1000) return rows;
    }
  };
  const readGuests = async () => {
    const rows: ShowGuestSong[] = [];
    if (!showId) return rows;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.from("show_guest_songs").select("*").eq("show_id", showId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 999);
      if (error) throw new Error(`Could not load this show's guest songs: ${error.message}`);
      rows.push(...(data ?? []) as ShowGuestSong[]);
      if ((data?.length ?? 0) < 1000) return rows;
    }
  };
  const [library, guests] = await Promise.all([readLibrary(), readGuests()]);
  return { library, guests };
}

export function combineFootswitchSongs(library: readonly SongRecord[], guests: readonly ShowGuestSong[], setlist: readonly FootswitchSong[]): FootswitchSong[] {
  const linked = new Set<string>();
  const songs: FootswitchSong[] = library.map((song) => {
    const entries = setlist.filter((entry) => entry.songId === song.id);
    entries.forEach((entry) => linked.add(entry.id));
    return { id: `library:${song.id}`, title: song.title, lyrics: song.lyrics ?? null, aliases: entries.map((entry) => entry.id), kind: "Library" };
  });
  guests.forEach((song) => {
    const entries = setlist.filter((entry) => !entry.songId && entry.guestSongId === song.id);
    entries.forEach((entry) => linked.add(entry.id));
    songs.push({ id: `guest:${song.id}`, title: song.title, lyrics: song.lyrics ?? null, aliases: entries.map((entry) => entry.id), kind: "Guest" });
  });
  // Retain supported setlist-only entries without duplicating linked library songs.
  songs.push(...setlist.filter((entry) => !linked.has(entry.id)));
  return songs.sort((a, b) => a.title.localeCompare(b.title));
}

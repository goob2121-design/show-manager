import { SMART_PAGING_SAMPLES } from "./footswitch-smart-paging-samples";
import type { DiagnosticSettings } from "./footswitch-diagnostic-settings";

// Read-only subset of library/guest songs and already resolved setlist entries.
export type FootswitchSong = Readonly<{ id: string; title: string; lyrics: string | null; songId?: string | null; guestSongId?: string | null; aliases?: readonly string[]; kind?: string }>;
export function diagnosticSong(settings: Pick<DiagnosticSettings, "source" | "sample" | "songId">, songs: readonly FootswitchSong[]) {
  if (settings.source === "sample") return { id: settings.sample, title: settings.sample === "realistic" ? "Realistic song" : "Long lines / overflow", lyrics: SMART_PAGING_SAMPLES[settings.sample] };
  return songs.find((song) => song.id === settings.songId || song.aliases?.includes(settings.songId)) ?? null;
}
export function searchDiagnosticSongs(songs: readonly FootswitchSong[], query: string) {
  return songs.filter((song) => song.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
}

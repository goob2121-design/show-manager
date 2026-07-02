export type SongResolverRecord = {
  custom_title?: string | null;
  title?: string | null;
  key?: string | null;
  song_key?: string | null;
  sung_by?: string | null;
  tempo?: string | null;
  notes?: string | null;
  lyrics?: string | null;
  chart_url?: string | null;
  mp3_path?: string | null;
  youtube_url?: string | null;
  performance_flow?: string | null;
  song_intro_notes?: string | null;
  default_performance_flow?: string | null;
  default_song_intro_notes?: string | null;
  default_intro_auto_open_lyrics?: boolean | null;
  default_intro_auto_open_delay?: number | null;
  default_lyrics_auto_start_scroll?: boolean | null;
  default_lyrics_auto_scroll_speed?: number | null;
  default_lyrics_auto_scroll_delay?: number | null;
  default_lyrics_font_size?: number | null;
  default_lyrics_reading_mode?: boolean | null;
  submitted_by_name?: string | null;
  library_song?: SongResolverRecord | SongResolverRecord[] | null;
  guest_song?: SongResolverRecord | SongResolverRecord[] | null;
};

export function resolveJoinedSong<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveSongTitle(entry: SongResolverRecord) {
  const librarySong = resolveJoinedSong(entry.library_song);
  const guestSong = resolveJoinedSong(entry.guest_song);
  return clean(entry.custom_title) ?? clean(librarySong?.title) ?? clean(guestSong?.title) ?? clean(entry.title) ?? "Untitled Song";
}

export function resolveSongLyrics(entry: SongResolverRecord) {
  const librarySong = resolveJoinedSong(entry.library_song);
  const guestSong = resolveJoinedSong(entry.guest_song);
  return librarySong?.lyrics ?? guestSong?.lyrics ?? entry.lyrics ?? null;
}

export function resolveSongKey(entry: SongResolverRecord) {
  const librarySong = resolveJoinedSong(entry.library_song);
  const guestSong = resolveJoinedSong(entry.guest_song);
  return librarySong?.key ?? guestSong?.key ?? guestSong?.song_key ?? entry.key ?? entry.song_key ?? null;
}

export function resolveLeadVocal(entry: SongResolverRecord) {
  const librarySong = resolveJoinedSong(entry.library_song);
  const guestSong = resolveJoinedSong(entry.guest_song);
  return librarySong?.sung_by ?? guestSong?.sung_by ?? entry.sung_by ?? guestSong?.submitted_by_name ?? null;
}

export function resolveSongTempo(entry: SongResolverRecord) {
  const librarySong = resolveJoinedSong(entry.library_song);
  const guestSong = resolveJoinedSong(entry.guest_song);
  return librarySong?.tempo ?? guestSong?.tempo ?? entry.tempo ?? null;
}

export function resolvePerformanceFlow(entry: SongResolverRecord) {
  const librarySong = resolveJoinedSong(entry.library_song);
  return entry.performance_flow ?? librarySong?.default_performance_flow ?? null;
}

export function resolveSongIntroNotes(entry: SongResolverRecord) {
  const librarySong = resolveJoinedSong(entry.library_song);
  return entry.song_intro_notes ?? librarySong?.default_song_intro_notes ?? null;
}

export const resolveLyrics = resolveSongLyrics;
export const resolveKey = resolveSongKey;
export const resolveTempo = resolveSongTempo;
export const resolveSongIntro = resolveSongIntroNotes;

export function resolveSongNotes(entry: SongResolverRecord) {
  const librarySong = resolveJoinedSong(entry.library_song);
  const guestSong = resolveJoinedSong(entry.guest_song);
  return librarySong?.notes ?? guestSong?.notes ?? entry.notes ?? null;
}

export function resolveChart(entry: SongResolverRecord) {
  const librarySong = resolveJoinedSong(entry.library_song);
  const guestSong = resolveJoinedSong(entry.guest_song);
  return librarySong?.chart_url ?? guestSong?.chart_url ?? entry.chart_url ?? null;
}

export function resolveMp3(entry: SongResolverRecord) {
  const librarySong = resolveJoinedSong(entry.library_song);
  const guestSong = resolveJoinedSong(entry.guest_song);
  return librarySong?.mp3_path ?? guestSong?.mp3_path ?? entry.mp3_path ?? null;
}

export function resolveYoutube(entry: SongResolverRecord) {
  const librarySong = resolveJoinedSong(entry.library_song);
  const guestSong = resolveJoinedSong(entry.guest_song);
  return librarySong?.youtube_url ?? guestSong?.youtube_url ?? entry.youtube_url ?? null;
}
alter table public.songs
  add column if not exists default_performance_flow text,
  add column if not exists default_song_intro_notes text,
  add column if not exists default_intro_auto_open_lyrics boolean default false,
  add column if not exists default_intro_auto_open_delay integer,
  add column if not exists default_lyrics_auto_start_scroll boolean default false,
  add column if not exists default_lyrics_auto_scroll_speed integer default 4,
  add column if not exists default_lyrics_auto_scroll_delay integer default 3,
  add column if not exists default_lyrics_font_size integer default 28,
  add column if not exists default_lyrics_reading_mode boolean default false;

alter table public.setlist_entries
  add column if not exists intro_auto_open_lyrics boolean,
  add column if not exists intro_auto_open_delay integer,
  add column if not exists lyrics_auto_start_scroll boolean,
  add column if not exists lyrics_auto_scroll_speed integer,
  add column if not exists lyrics_auto_scroll_delay integer,
  add column if not exists lyrics_font_size integer,
  add column if not exists lyrics_reading_mode boolean;

update public.songs
set default_performance_flow = performance_flow
where nullif(btrim(coalesce(default_performance_flow, '')), '') is null
  and nullif(btrim(coalesce(performance_flow, '')), '') is not null;

update public.songs
set default_song_intro_notes = song_intro_notes
where nullif(btrim(coalesce(default_song_intro_notes, '')), '') is null
  and nullif(btrim(coalesce(song_intro_notes, '')), '') is not null;

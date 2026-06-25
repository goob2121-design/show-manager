alter table public.songs
  add column if not exists performance_flow text,
  add column if not exists song_intro_notes text;

alter table public.setlist_entries
  add column if not exists song_intro_notes text;

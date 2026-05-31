alter table public.show_guest_songs
  add column if not exists sung_by text;

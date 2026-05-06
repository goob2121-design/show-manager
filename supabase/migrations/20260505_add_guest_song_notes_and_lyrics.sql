alter table public.show_guest_songs
  add column if not exists notes text,
  add column if not exists lyrics text;

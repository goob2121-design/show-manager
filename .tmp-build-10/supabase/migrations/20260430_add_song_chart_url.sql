alter table public.songs
  add column if not exists chart_url text;

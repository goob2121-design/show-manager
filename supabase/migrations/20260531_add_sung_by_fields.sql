alter table public.songs
  add column if not exists sung_by text;

alter table public.rehearsal_entries
  add column if not exists sung_by text;

alter table public.setlist_entries
  add column if not exists key_override text,
  add column if not exists sung_by_override text;
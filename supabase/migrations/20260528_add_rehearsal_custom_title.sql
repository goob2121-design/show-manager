alter table public.rehearsal_entries
  add column if not exists custom_title text;

alter table public.rehearsal_entries
  add column if not exists section_label text;

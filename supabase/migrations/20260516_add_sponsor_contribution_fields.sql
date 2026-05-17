alter table public.sponsor_library
  add column if not exists sponsor_type text,
  add column if not exists default_contribution text,
  add column if not exists estimated_value numeric,
  add column if not exists recognition_notes text;

alter table public.show_sponsors
  add column if not exists sponsor_type text,
  add column if not exists default_contribution text,
  add column if not exists estimated_value numeric,
  add column if not exists recognition_notes text;

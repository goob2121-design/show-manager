alter table public.promo_materials
  add column if not exists download_file_name text,
  add column if not exists download_file_path text,
  add column if not exists download_file_url text,
  add column if not exists download_file_mime_type text,
  add column if not exists download_file_size bigint;

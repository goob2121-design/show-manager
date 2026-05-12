alter table public.sponsor_library
  add column if not exists is_archived boolean not null default false;

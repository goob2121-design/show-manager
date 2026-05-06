alter table public.guest_profiles
  add column if not exists is_confirmed boolean not null default false;

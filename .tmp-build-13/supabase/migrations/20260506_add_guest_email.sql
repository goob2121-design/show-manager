alter table public.guest_profiles
  add column if not exists email text;

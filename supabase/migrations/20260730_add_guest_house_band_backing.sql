alter table public.guest_profiles
  add column if not exists house_band_backing_guest boolean not null default false;
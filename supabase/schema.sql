create extension if not exists pgcrypto;

create table if not exists public.shows (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  show_date date,
  venue text,
  created_at timestamptz not null default now()
);

alter table public.shows
  add column if not exists venue_address text,
  add column if not exists directions_url text,
  add column if not exists call_time text,
  add column if not exists soundcheck_time text,
  add column if not exists guest_arrival_time text,
  add column if not exists band_arrival_time text,
  add column if not exists show_start_time text,
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists parking_notes text,
  add column if not exists load_in_notes text,
  add column if not exists announcements text;

alter table public.shows
  add column if not exists guest_message text;

alter table public.shows
  add column if not exists is_archived boolean default false;

create table if not exists public.setlist_songs (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  position integer not null,
  title text not null,
  artist text,
  song_key text,
  notes text,
  lyrics text,
  created_at timestamptz not null default now()
);

alter table public.setlist_songs
  add column if not exists set_section text;

create table if not exists public.pending_submissions (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  title text not null,
  artist text,
  song_key text,
  notes text,
  lyrics text,
  submitted_by_role text not null,
  created_at timestamptz not null default now()
);

alter table public.pending_submissions
  add column if not exists submitted_by_name text;

create table if not exists public.guest_profiles (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  name text,
  short_bio text,
  full_bio text,
  hometown text,
  instruments text,
  facebook text,
  instagram text,
  website text,
  photo_url text,
  permission_granted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.song_library (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  song_key text,
  notes text,
  lyrics text,
  source_role text,
  created_at timestamptz not null default now()
);

create index if not exists setlist_songs_show_id_position_idx
  on public.setlist_songs(show_id, position);

create index if not exists pending_submissions_show_id_created_at_idx
  on public.pending_submissions(show_id, created_at);

create index if not exists guest_profiles_show_id_created_at_idx
  on public.guest_profiles(show_id, created_at);

create unique index if not exists guest_profiles_show_id_name_unique
  on public.guest_profiles(show_id, lower(name));

insert into storage.buckets (id, name, public)
values ('guest-photos', 'guest-photos', true)
on conflict (id) do update
set public = excluded.public;

insert into public.shows (slug, name, show_date)
values ('cmms-april-27', 'Cumberland Mountain Music Show', '2026-04-27')
on conflict (slug) do update
set
  name = excluded.name,
  show_date = excluded.show_date;

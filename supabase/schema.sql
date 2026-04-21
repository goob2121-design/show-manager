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

alter table public.shows
  add column if not exists opening_script text,
  add column if not exists intermission_script text,
  add column if not exists closing_script text;

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
  add column if not exists set_section text,
  add column if not exists source_role text;

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

create table if not exists public.sponsor_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_message text,
  full_message text,
  website text,
  created_at timestamptz not null default now()
);

create table if not exists public.show_sponsors (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  sponsor_id uuid references public.sponsor_library(id) on delete cascade,
  placement_order integer not null default 1,
  placement_type text,
  linked_performer text,
  custom_note text,
  created_at timestamptz not null default now()
);

alter table public.show_sponsors
  add column if not exists sponsor_id uuid references public.sponsor_library(id) on delete cascade,
  add column if not exists placement_order integer not null default 1,
  add column if not exists placement_type text,
  add column if not exists linked_performer text,
  add column if not exists custom_note text,
  add column if not exists name text,
  add column if not exists short_message text,
  add column if not exists full_message text,
  add column if not exists placement_note text;

insert into public.sponsor_library (name, short_message, full_message)
select distinct
  show_sponsors.name,
  show_sponsors.short_message,
  show_sponsors.full_message
from public.show_sponsors
where show_sponsors.name is not null
  and not exists (
    select 1
    from public.sponsor_library
    where lower(public.sponsor_library.name) = lower(show_sponsors.name)
  );

update public.show_sponsors
set sponsor_id = sponsor_library.id
from public.sponsor_library
where public.show_sponsors.sponsor_id is null
  and public.show_sponsors.name is not null
  and lower(public.show_sponsors.name) = lower(sponsor_library.name);

create table if not exists public.mc_block_notes (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  anchor_song_id uuid not null references public.setlist_songs(id) on delete cascade,
  intro_note text,
  sponsor_mention text,
  transition_note text,
  created_at timestamptz not null default now()
);

create index if not exists setlist_songs_show_id_position_idx
  on public.setlist_songs(show_id, position);

create index if not exists pending_submissions_show_id_created_at_idx
  on public.pending_submissions(show_id, created_at);

create index if not exists guest_profiles_show_id_created_at_idx
  on public.guest_profiles(show_id, created_at);

create index if not exists show_sponsors_show_id_created_at_idx
  on public.show_sponsors(show_id, created_at);

create index if not exists show_sponsors_show_id_order_idx
  on public.show_sponsors(show_id, placement_order);

create index if not exists sponsor_library_name_idx
  on public.sponsor_library(lower(name));

create index if not exists mc_block_notes_show_id_anchor_idx
  on public.mc_block_notes(show_id, anchor_song_id);

create unique index if not exists mc_block_notes_show_id_anchor_unique
  on public.mc_block_notes(show_id, anchor_song_id);

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

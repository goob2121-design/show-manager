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
  add column if not exists promo_short text,
  add column if not exists promo_long text,
  add column if not exists ticket_link text;

alter table public.shows
  add column if not exists is_archived boolean default false;

alter table public.shows
  add column if not exists opening_script text,
  add column if not exists intermission_script text,
  add column if not exists closing_script text;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  key text,
  tempo text check (tempo in ('fast', 'medium', 'slow')),
  song_type text check (song_type in ('vocal', 'instrumental')),
  notes text,
  lyrics text,
  created_by_role text not null check (created_by_role in ('band', 'admin')),
  created_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.show_guest_songs (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  title text not null,
  key text,
  tempo text check (tempo in ('fast', 'medium', 'slow')),
  song_type text check (song_type in ('vocal', 'instrumental')),
  submitted_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.setlist_entries (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  section text not null check (section in ('set1', 'set2', 'encore')),
  position integer not null,
  source_type text not null check (source_type in ('library', 'guest')),
  song_id uuid references public.songs(id),
  guest_song_id uuid references public.show_guest_songs(id) on delete cascade,
  custom_title text,
  created_at timestamptz not null default now(),
  constraint setlist_entries_source_reference_check check (
    (source_type = 'library' and song_id is not null and guest_song_id is null) or
    (source_type = 'guest' and guest_song_id is not null and song_id is null)
  )
);

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

create table if not exists public.sponsor_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_message text,
  full_message text,
  website text,
  created_at timestamptz not null default now()
);

alter table public.sponsor_library
  add column if not exists logo_url text;

create table if not exists public.show_sponsors (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  sponsor_id uuid references public.sponsor_library(id) on delete cascade,
  placement_order integer not null default 1,
  placement_type text,
  mc_anchor_song_id uuid references public.setlist_entries(id) on delete set null,
  linked_performer text,
  custom_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_materials (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'other' check (
    category in ('flyer', 'social_graphic', 'poster', 'sponsor_graphic', 'logo', 'promo_photo', 'other')
  ),
  file_name text not null,
  file_path text not null,
  file_url text not null,
  file_mime_type text,
  file_size bigint,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promo_materials_show_id_created_at_idx
  on public.promo_materials(show_id, created_at);

create index if not exists promo_materials_show_id_visible_idx
  on public.promo_materials(show_id, is_visible);

alter table public.show_sponsors
  add column if not exists sponsor_id uuid references public.sponsor_library(id) on delete cascade,
  add column if not exists placement_order integer not null default 1,
  add column if not exists placement_type text,
  add column if not exists mc_anchor_song_id uuid references public.setlist_entries(id) on delete set null,
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
  anchor_song_id uuid not null references public.setlist_entries(id) on delete cascade,
  intro_note text,
  sponsor_mention text,
  transition_note text,
  created_at timestamptz not null default now()
);

create index if not exists songs_title_key_idx
  on public.songs(lower(title), lower(coalesce(key, '')));

create unique index if not exists songs_title_key_unique
  on public.songs(lower(title), lower(coalesce(key, '')));

create index if not exists show_guest_songs_show_id_created_at_idx
  on public.show_guest_songs(show_id, created_at);

create index if not exists show_guest_songs_show_id_title_idx
  on public.show_guest_songs(show_id, lower(title));

create index if not exists setlist_entries_show_id_position_idx
  on public.setlist_entries(show_id, section, position);

create index if not exists guest_profiles_show_id_created_at_idx
  on public.guest_profiles(show_id, created_at);

create index if not exists show_sponsors_show_id_created_at_idx
  on public.show_sponsors(show_id, created_at);

create index if not exists show_sponsors_show_id_order_idx
  on public.show_sponsors(show_id, placement_order);

create index if not exists show_sponsors_mc_anchor_song_idx
  on public.show_sponsors(mc_anchor_song_id);

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

insert into storage.buckets (id, name, public)
values ('sponsor-logos', 'sponsor-logos', true)
on conflict (id) do update
set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('promo-materials', 'promo-materials', true)
on conflict (id) do update
set public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Sponsor logos are publicly readable'
  ) then
    create policy "Sponsor logos are publicly readable"
      on storage.objects
      for select
      to public
      using (bucket_id = 'sponsor-logos');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Sponsor logos can be uploaded publicly'
  ) then
    create policy "Sponsor logos can be uploaded publicly"
      on storage.objects
      for insert
      to public
      with check (bucket_id = 'sponsor-logos');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Sponsor logos can be updated publicly'
  ) then
    create policy "Sponsor logos can be updated publicly"
      on storage.objects
      for update
      to public
      using (bucket_id = 'sponsor-logos')
      with check (bucket_id = 'sponsor-logos');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Promo materials are publicly readable'
  ) then
    create policy "Promo materials are publicly readable"
      on storage.objects
      for select
      to public
      using (bucket_id = 'promo-materials');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Promo materials can be uploaded publicly'
  ) then
    create policy "Promo materials can be uploaded publicly"
      on storage.objects
      for insert
      to public
      with check (bucket_id = 'promo-materials');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Promo materials can be updated publicly'
  ) then
    create policy "Promo materials can be updated publicly"
      on storage.objects
      for update
      to public
      using (bucket_id = 'promo-materials')
      with check (bucket_id = 'promo-materials');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Promo materials can be deleted publicly'
  ) then
    create policy "Promo materials can be deleted publicly"
      on storage.objects
      for delete
      to public
      using (bucket_id = 'promo-materials');
  end if;
end
$$;

insert into public.shows (slug, name, show_date)
values ('cmms-april-27', 'Cumberland Mountain Music Show', '2026-04-27')
on conflict (slug) do update
set
  name = excluded.name,
  show_date = excluded.show_date;

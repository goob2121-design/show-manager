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
  add column if not exists show_logo_url text,
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
  sung_by text,
  tempo text check (tempo in ('fast', 'medium', 'slow')),
  song_type text check (song_type in ('vocal', 'instrumental')),
  notes text,
  lyrics text,
  chart_url text,
  created_by_role text not null check (created_by_role in ('band', 'admin')),
  created_by_name text,
  created_at timestamptz not null default now()
);

alter table public.songs
  add column if not exists chart_url text;

create table if not exists public.show_guest_songs (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  title text not null,
  key text,
  sung_by text,
  tempo text check (tempo in ('fast', 'medium', 'slow')),
  song_type text check (song_type in ('vocal', 'instrumental')),
  notes text,
  lyrics text,
  submitted_by_name text,
  created_at timestamptz not null default now()
);

alter table public.show_guest_songs
  add column if not exists notes text,
  add column if not exists lyrics text,
  add column if not exists sung_by text;

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

alter table public.setlist_entries
  add column if not exists performance_flow text;

create table if not exists public.guest_profiles (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  name text,
  short_bio text,
  full_bio text,
  hometown text,
  instruments text,
  email text,
  facebook text,
  instagram text,
  website text,
  photo_url text,
  agreed_fee text,
  planned_song_count integer,
  backup_song_count integer,
  appearance_notes text,
  guest_token text,
  portal_opened_at timestamptz,
  last_reminder_sent_at timestamptz,
  is_confirmed boolean not null default false,
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

alter table public.sponsor_library
  add column if not exists sponsorship_level text,
  add column if not exists sponsorship_amount numeric,
  add column if not exists sponsor_type text,
  add column if not exists default_contribution text,
  add column if not exists estimated_value numeric,
  add column if not exists recognition_notes text,
  add column if not exists is_archived boolean not null default false,
  add column if not exists payment_status text default 'prospect',
  add column if not exists proposal_generated_at timestamptz,
  add column if not exists quote_generated_at timestamptz,
  add column if not exists receipt_generated_at timestamptz;

create table if not exists public.potential_sponsors (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text,
  phone text,
  email text,
  notes text,
  status text not null default 'Not Contacted',
  created_at timestamptz not null default now()
);

create table if not exists public.show_sponsors (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  sponsor_id uuid references public.sponsor_library(id) on delete cascade,
  placement_order integer not null default 1,
  placement_type text,
  mc_anchor_song_id uuid references public.setlist_entries(id) on delete set null,
  linked_performer text,
  custom_note text,
  comp_ticket_allowance integer not null default 0,
  comp_tickets_checked_in integer not null default 0,
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
  download_file_name text,
  download_file_path text,
  download_file_url text,
  download_file_mime_type text,
  download_file_size bigint,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promo_materials_show_id_created_at_idx
  on public.promo_materials(show_id, created_at);

create index if not exists promo_materials_show_id_visible_idx
  on public.promo_materials(show_id, is_visible);

create table if not exists public.promo_links (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  title text not null,
  url text not null,
  link_type text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promo_links_show_id_created_at_idx
  on public.promo_links(show_id, created_at);

create table if not exists public.rehearsal_entries (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  song_id uuid references public.songs(id) on delete set null,
  custom_title text,
  key text,
  sung_by text,
  notes text,
  section_label text,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.rehearsal_recordings (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  rehearsal_entry_id uuid references public.rehearsal_entries(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_url text,
  created_at timestamptz not null default now()
);

create index if not exists rehearsal_entries_show_id_sort_order_idx
  on public.rehearsal_entries(show_id, sort_order, created_at);

create index if not exists rehearsal_recordings_show_id_created_at_idx
  on public.rehearsal_recordings(show_id, created_at);

create index if not exists rehearsal_recordings_entry_id_created_at_idx
  on public.rehearsal_recordings(rehearsal_entry_id, created_at);

create table if not exists public.live_show_state (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  current_song_index integer not null default 0,
  current_set_number integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists live_show_state_show_id_unique
  on public.live_show_state(show_id);

alter table public.show_sponsors
  add column if not exists sponsor_id uuid references public.sponsor_library(id) on delete cascade,
  add column if not exists placement_order integer not null default 1,
  add column if not exists placement_type text,
  add column if not exists mc_anchor_song_id uuid references public.setlist_entries(id) on delete set null,
  add column if not exists linked_performer text,
  add column if not exists custom_note text,
  add column if not exists sponsor_type text,
  add column if not exists default_contribution text,
  add column if not exists estimated_value numeric,
  add column if not exists recognition_notes text,
  add column if not exists comp_ticket_allowance integer not null default 0,
  add column if not exists comp_tickets_checked_in integer not null default 0,
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

create table if not exists public.mc_special_segments (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  title text not null,
  notes text,
  placement_type text,
  anchor_song_id uuid references public.setlist_entries(id) on delete set null,
  placement_order integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.mc_sponsor_reads (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  show_sponsor_id uuid not null references public.show_sponsors(id) on delete cascade,
  placement_order integer not null default 1,
  placement_type text,
  anchor_song_id uuid references public.setlist_entries(id) on delete set null,
  linked_performer text,
  custom_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.show_finance_items (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  category text,
  label text not null,
  amount numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.show_checklist_items (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  task text not null,
  completed boolean not null default false,
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.show_payout_items (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  payee_name text not null,
  category text,
  description text,
  amount numeric not null default 0,
  paid boolean not null default false,
  payment_method text,
  created_at timestamptz not null default now()
);

create table if not exists public.show_comp_tickets (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  guest_name text not null,
  email text,
  ticket_count integer not null default 1,
  ticket_type text not null default 'complimentary',
  order_id text,
  import_key text,
  notes text,
  checked_in boolean not null default false,
  checked_in_count integer not null default 0,
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

create index if not exists mc_special_segments_show_id_order_idx
  on public.mc_special_segments(show_id, placement_order, created_at);

create index if not exists mc_sponsor_reads_show_id_order_idx
  on public.mc_sponsor_reads(show_id, placement_order, created_at);

create index if not exists mc_sponsor_reads_show_sponsor_id_idx
  on public.mc_sponsor_reads(show_sponsor_id);

create index if not exists show_finance_items_show_id_created_at_idx
  on public.show_finance_items(show_id, created_at);

create index if not exists show_finance_items_show_id_type_idx
  on public.show_finance_items(show_id, type);

create index if not exists show_checklist_items_show_id_created_at_idx
  on public.show_checklist_items(show_id, created_at);

create index if not exists show_payout_items_show_id_created_at_idx
  on public.show_payout_items(show_id, created_at);

create index if not exists show_comp_tickets_show_id_created_at_idx
  on public.show_comp_tickets(show_id, created_at);

alter table public.show_checklist_items enable row level security;
alter table public.show_payout_items enable row level security;
alter table public.show_comp_tickets enable row level security;
alter table public.promo_links enable row level security;
alter table public.rehearsal_entries enable row level security;
alter table public.rehearsal_recordings enable row level security;
alter table public.live_show_state enable row level security;
alter table public.mc_special_segments enable row level security;
alter table public.mc_sponsor_reads enable row level security;

create unique index if not exists guest_profiles_show_id_name_unique
  on public.guest_profiles(show_id, lower(name));

create unique index if not exists guest_profiles_guest_token_unique
  on public.guest_profiles(guest_token)
  where guest_token is not null;

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

insert into storage.buckets (id, name, public)
values ('rehearsal-recordings', 'rehearsal-recordings', true)
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

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Rehearsal recordings are publicly readable'
  ) then
    create policy "Rehearsal recordings are publicly readable"
      on storage.objects
      for select
      to public
      using (bucket_id = 'rehearsal-recordings');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Rehearsal recordings can be uploaded publicly'
  ) then
    create policy "Rehearsal recordings can be uploaded publicly"
      on storage.objects
      for insert
      to public
      with check (bucket_id = 'rehearsal-recordings');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Rehearsal recordings can be updated publicly'
  ) then
    create policy "Rehearsal recordings can be updated publicly"
      on storage.objects
      for update
      to public
      using (bucket_id = 'rehearsal-recordings')
      with check (bucket_id = 'rehearsal-recordings');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Rehearsal recordings can be deleted publicly'
  ) then
    create policy "Rehearsal recordings can be deleted publicly"
      on storage.objects
      for delete
      to public
      using (bucket_id = 'rehearsal-recordings');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'promo_links'
      and policyname = 'Allow public read promo links'
  ) then
    create policy "Allow public read promo links"
      on public.promo_links
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'promo_links'
      and policyname = 'Allow public insert promo links'
  ) then
    create policy "Allow public insert promo links"
      on public.promo_links
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'promo_links'
      and policyname = 'Allow public update promo links'
  ) then
    create policy "Allow public update promo links"
      on public.promo_links
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'promo_links'
      and policyname = 'Allow public delete promo links'
  ) then
create policy "Allow public delete promo links"
on public.promo_links
for delete
to anon, authenticated
using (true);

drop policy if exists "Allow public read mc special segments" on public.mc_special_segments;
drop policy if exists "Allow public insert mc special segments" on public.mc_special_segments;
drop policy if exists "Allow public update mc special segments" on public.mc_special_segments;
drop policy if exists "Allow public delete mc special segments" on public.mc_special_segments;

create policy "Allow public read mc special segments"
on public.mc_special_segments
for select
to anon, authenticated
using (true);

create policy "Allow public insert mc special segments"
on public.mc_special_segments
for insert
to anon, authenticated
with check (true);

create policy "Allow public update mc special segments"
on public.mc_special_segments
for update
to anon, authenticated
using (true)
with check (true);

create policy "Allow public delete mc special segments"
on public.mc_special_segments
for delete
to anon, authenticated
using (true);

drop policy if exists "Allow public read mc sponsor reads" on public.mc_sponsor_reads;
drop policy if exists "Allow public insert mc sponsor reads" on public.mc_sponsor_reads;
drop policy if exists "Allow public update mc sponsor reads" on public.mc_sponsor_reads;
drop policy if exists "Allow public delete mc sponsor reads" on public.mc_sponsor_reads;

create policy "Allow public read mc sponsor reads"
on public.mc_sponsor_reads
for select
to anon, authenticated
using (true);

create policy "Allow public insert mc sponsor reads"
on public.mc_sponsor_reads
for insert
to anon, authenticated
with check (true);

create policy "Allow public update mc sponsor reads"
on public.mc_sponsor_reads
for update
to anon, authenticated
using (true)
with check (true);

create policy "Allow public delete mc sponsor reads"
on public.mc_sponsor_reads
for delete
to anon, authenticated
using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rehearsal_entries'
      and policyname = 'Allow public read rehearsal entries'
  ) then
    create policy "Allow public read rehearsal entries"
      on public.rehearsal_entries
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rehearsal_entries'
      and policyname = 'Allow public insert rehearsal entries'
  ) then
    create policy "Allow public insert rehearsal entries"
      on public.rehearsal_entries
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rehearsal_entries'
      and policyname = 'Allow public update rehearsal entries'
  ) then
    create policy "Allow public update rehearsal entries"
      on public.rehearsal_entries
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rehearsal_entries'
      and policyname = 'Allow public delete rehearsal entries'
  ) then
    create policy "Allow public delete rehearsal entries"
      on public.rehearsal_entries
      for delete
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rehearsal_recordings'
      and policyname = 'Allow public read rehearsal recordings'
  ) then
    create policy "Allow public read rehearsal recordings"
      on public.rehearsal_recordings
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rehearsal_recordings'
      and policyname = 'Allow public insert rehearsal recordings'
  ) then
    create policy "Allow public insert rehearsal recordings"
      on public.rehearsal_recordings
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rehearsal_recordings'
      and policyname = 'Allow public update rehearsal recordings'
  ) then
    create policy "Allow public update rehearsal recordings"
      on public.rehearsal_recordings
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rehearsal_recordings'
      and policyname = 'Allow public delete rehearsal recordings'
  ) then
    create policy "Allow public delete rehearsal recordings"
      on public.rehearsal_recordings
      for delete
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'live_show_state'
      and policyname = 'Allow public read live show state'
  ) then
    create policy "Allow public read live show state"
      on public.live_show_state
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'live_show_state'
      and policyname = 'Allow public insert live show state'
  ) then
    create policy "Allow public insert live show state"
      on public.live_show_state
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'live_show_state'
      and policyname = 'Allow public update live show state'
  ) then
    create policy "Allow public update live show state"
      on public.live_show_state
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'live_show_state'
      and policyname = 'Allow public delete live show state'
  ) then
    create policy "Allow public delete live show state"
      on public.live_show_state
      for delete
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_checklist_items'
      and policyname = 'Allow public read show checklist items'
  ) then
    create policy "Allow public read show checklist items"
      on public.show_checklist_items
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_checklist_items'
      and policyname = 'Allow public insert show checklist items'
  ) then
    create policy "Allow public insert show checklist items"
      on public.show_checklist_items
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_checklist_items'
      and policyname = 'Allow public update show checklist items'
  ) then
    create policy "Allow public update show checklist items"
      on public.show_checklist_items
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_checklist_items'
      and policyname = 'Allow public delete show checklist items'
  ) then
    create policy "Allow public delete show checklist items"
      on public.show_checklist_items
      for delete
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_payout_items'
      and policyname = 'Allow public read show payout items'
  ) then
    create policy "Allow public read show payout items"
      on public.show_payout_items
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_payout_items'
      and policyname = 'Allow public insert show payout items'
  ) then
    create policy "Allow public insert show payout items"
      on public.show_payout_items
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_payout_items'
      and policyname = 'Allow public update show payout items'
  ) then
    create policy "Allow public update show payout items"
      on public.show_payout_items
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_payout_items'
      and policyname = 'Allow public delete show payout items'
  ) then
    create policy "Allow public delete show payout items"
      on public.show_payout_items
      for delete
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_comp_tickets'
      and policyname = 'Allow public read show comp tickets'
  ) then
    create policy "Allow public read show comp tickets"
      on public.show_comp_tickets
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_comp_tickets'
      and policyname = 'Allow public insert show comp tickets'
  ) then
    create policy "Allow public insert show comp tickets"
      on public.show_comp_tickets
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_comp_tickets'
      and policyname = 'Allow public update show comp tickets'
  ) then
    create policy "Allow public update show comp tickets"
      on public.show_comp_tickets
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_comp_tickets'
      and policyname = 'Allow public delete show comp tickets'
  ) then
    create policy "Allow public delete show comp tickets"
      on public.show_comp_tickets
      for delete
      to anon, authenticated
      using (true);
  end if;
end
$$;

insert into public.shows (slug, name, show_date)
values ('cmms-april-27', 'Cumberland Mountain Music Show', '2026-04-27')
on conflict (slug) do update
set
  name = excluded.name,
  show_date = excluded.show_date;

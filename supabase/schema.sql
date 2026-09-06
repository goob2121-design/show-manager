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
  add column if not exists ticket_link text,
  add column if not exists ticket_code_format text;
alter table public.shows
  add column if not exists ticket_sale_status text not null default 'public',
  add column if not exists presale_starts_at timestamptz,
  add column if not exists public_sale_starts_at timestamptz,
  add column if not exists presale_access_code text;

alter table public.shows
  drop constraint if exists shows_ticket_sale_status_check;
alter table public.shows
  add constraint shows_ticket_sale_status_check
  check (ticket_sale_status in ('not_on_sale', 'presale', 'public'));

alter table public.shows
  add column if not exists is_archived boolean default false;

alter table public.shows
  add column if not exists square_finance_sync_enabled boolean not null default false,
  add column if not exists square_finance_sync_started_at timestamptz;

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
  add column if not exists performance_flow text,
  add column if not exists intro_auto_open_lyrics boolean,
  add column if not exists intro_auto_open_delay integer,
  add column if not exists lyrics_auto_start_scroll boolean,
  add column if not exists lyrics_auto_scroll_speed integer,
  add column if not exists lyrics_auto_scroll_delay integer,
  add column if not exists lyrics_font_size integer,
  add column if not exists lyrics_reading_mode boolean;

alter table public.songs
  add column if not exists performance_flow text,
  add column if not exists song_intro_notes text,
  add column if not exists default_performance_flow text,
  add column if not exists default_song_intro_notes text,
  add column if not exists default_intro_auto_open_lyrics boolean default false,
  add column if not exists default_intro_auto_open_delay integer,
  add column if not exists default_lyrics_auto_start_scroll boolean default false,
  add column if not exists default_lyrics_auto_scroll_speed integer default 4,
  add column if not exists default_lyrics_auto_scroll_delay integer default 3,
  add column if not exists default_lyrics_font_size integer default 28,
  add column if not exists default_lyrics_reading_mode boolean default false;

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
  portal_opened_at timestamptz,
  last_reminder_sent_at timestamptz,
  house_band_backing_guest boolean not null default false,
  is_confirmed boolean not null default false,
  permission_granted boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.show_guest_songs
  add column if not exists guest_profile_id uuid references public.guest_profiles(id) on delete restrict,
  add column if not exists is_placeholder boolean not null default false,
  add column if not exists placeholder_number integer;

create unique index if not exists show_guest_songs_placeholder_number_idx
  on public.show_guest_songs(show_id, guest_profile_id, placeholder_number)
  where is_placeholder = true;

alter table public.show_guest_songs
  drop constraint if exists show_guest_songs_placeholder_fields_check,
  add constraint show_guest_songs_placeholder_fields_check check (
    (is_placeholder = false and placeholder_number is null)
    or
    (is_placeholder = true and guest_profile_id is not null and placeholder_number > 0)
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

alter table public.sponsor_library
  add column if not exists contact_person text,
  add column if not exists contact_title text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists mobile_phone text,
  add column if not exists preferred_contact_method text not null default 'none' check (preferred_contact_method in ('email', 'phone', 'text', 'none')),
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists legal_name text,
  add column if not exists recognition_name text,
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists standard_sponsorship_amount numeric,
  add column if not exists is_in_kind boolean not null default false,
  add column if not exists in_kind_description text,
  add column if not exists sponsor_since_year integer,
  add column if not exists renewal_date date,
  add column if not exists notes text,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists preferred_contact_notes text;

-- Sponsor RSVP Phase 1. Sponsor IDs are permanent, opaque public identifiers.
create or replace function public.generate_sponsor_code()
returns text language plpgsql set search_path = public as $$
declare allowed_letters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ'; candidate text;
begin
  perform pg_advisory_xact_lock(hashtext('sponsor_library_sponsor_code'));
  loop
    candidate := substr(allowed_letters, 1 + floor(random() * length(allowed_letters))::integer, 1)
      || substr(allowed_letters, 1 + floor(random() * length(allowed_letters))::integer, 1)
      || lpad(floor(random() * 100)::integer::text, 2, '0');
    exit when not exists (select 1 from public.sponsor_library where sponsor_code = candidate);
  end loop;
  return candidate;
end;
$$;
alter table public.sponsor_library add column if not exists sponsor_code text;
update public.sponsor_library set sponsor_code = public.generate_sponsor_code() where sponsor_code is null;
alter table public.sponsor_library alter column sponsor_code set default public.generate_sponsor_code();
alter table public.sponsor_library alter column sponsor_code set not null;
create unique index if not exists sponsor_library_sponsor_code_unique_idx on public.sponsor_library(sponsor_code);

create table if not exists public.sponsor_show_rsvps (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsor_library(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'attending', 'not_attending')),
  guest_count integer check (guest_count is null or guest_count >= 0),
  note text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sponsor_id, show_id),
  check ((status = 'attending' and guest_count is not null and guest_count > 0) or status <> 'attending')
);
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
  source text,
  source_kind text,
  external_payment_id text,
  external_order_id text,
  external_line_item_uid text,
  currency text,
  original_amount_cents bigint,
  occurred_at timestamptz,
  imported_at timestamptz,
  is_system_managed boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists show_finance_items_square_gross_sale_unique
  on public.show_finance_items(
    source,
    source_kind,
    show_id,
    external_payment_id,
    external_order_id,
    external_line_item_uid
  );
create or replace function public.prevent_system_managed_finance_item_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.is_system_managed then
    raise exception 'System-managed Finance items are read-only.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_system_managed_finance_item_update on public.show_finance_items;
create trigger prevent_system_managed_finance_item_update
  before update on public.show_finance_items
  for each row execute function public.prevent_system_managed_finance_item_mutation();

drop trigger if exists prevent_system_managed_finance_item_delete on public.show_finance_items;
create trigger prevent_system_managed_finance_item_delete
  before delete on public.show_finance_items
  for each row execute function public.prevent_system_managed_finance_item_mutation();

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
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_show_state'
  ) then
    alter publication supabase_realtime add table public.live_show_state;
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

create table if not exists public.sponsor_ticket_templates (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references public.shows(id) on delete cascade,
  name text not null,
  file_name text not null,
  file_path text not null,
  file_url text not null,
  file_mime_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sponsor_ticket_templates_show_id_created_at_idx
  on public.sponsor_ticket_templates(show_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('sponsor-ticket-templates', 'sponsor-ticket-templates', true)
on conflict (id) do update
set public = excluded.public;
alter table public.sponsor_ticket_templates enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sponsor_ticket_templates' and policyname = 'Allow authenticated read sponsor ticket templates') then
    create policy "Allow authenticated read sponsor ticket templates" on public.sponsor_ticket_templates for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sponsor_ticket_templates' and policyname = 'Allow authenticated insert sponsor ticket templates') then
    create policy "Allow authenticated insert sponsor ticket templates" on public.sponsor_ticket_templates for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sponsor_ticket_templates' and policyname = 'Allow authenticated update sponsor ticket templates') then
    create policy "Allow authenticated update sponsor ticket templates" on public.sponsor_ticket_templates for update to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sponsor_ticket_templates' and policyname = 'Allow authenticated delete sponsor ticket templates') then
    create policy "Allow authenticated delete sponsor ticket templates" on public.sponsor_ticket_templates for delete to authenticated using (true);
  end if;
end
$$;
create table if not exists public.manual_email_bulk_operations (
  id uuid primary key,
  show_id uuid not null references public.shows(id) on delete cascade,
  audience_key text not null,
  audience_label text not null,
  template_key text not null,
  sender_key text not null,
  from_address text not null,
  subject_template text not null,
  requested_recipient_count integer not null default 0,
  selected_recipient_count integer not null default 0,
  skipped_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  operation_status text not null check (operation_status in ('pending', 'sending', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.manual_email_history (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  recipient_name text,
  recipient_email text not null,
  from_address text not null,
  reply_to text,
  subject text not null,
  message_text text,
  template_key text not null check (template_key in (
    'general',
    'complimentary_tickets',
    'reserved_seating',
    'sponsor_message',
    'show_information',
    'custom'
  )),
  send_status text not null check (send_status in ('queued', 'sent', 'failed')),
  current_status text,
  resend_message_id text,
  error_message text,
  request_id uuid,
  bulk_operation_id uuid references public.manual_email_bulk_operations(id) on delete set null,
  original_delivery_id uuid references public.manual_email_history(id) on delete set null,
  sent_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manual_email_bulk_operations_show_created_at_idx
  on public.manual_email_bulk_operations(show_id, created_at desc);

create index if not exists manual_email_history_show_created_at_idx
  on public.manual_email_history(show_id, created_at desc);
create unique index if not exists manual_email_history_request_id_unique
  on public.manual_email_history(request_id) where request_id is not null;
create unique index if not exists manual_email_history_resend_message_id_unique
  on public.manual_email_history(resend_message_id) where resend_message_id is not null;

create table if not exists public.manual_email_events (
  id uuid primary key default gen_random_uuid(),
  email_history_id uuid not null references public.manual_email_history(id) on delete cascade,
  resend_message_id text not null,
  event_type text not null check (event_type in (
    'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.complained',
    'email.bounced', 'email.opened', 'email.clicked', 'email.failed'
  )),
  event_created_at timestamptz not null,
  recipient text,
  safe_clicked_url text,
  detail text,
  provider_event_id text,
  event_fingerprint text not null,
  received_at timestamptz not null default now()
);

create unique index if not exists manual_email_events_fingerprint_unique on public.manual_email_events(event_fingerprint);
create index if not exists manual_email_events_history_created_at_idx on public.manual_email_events(email_history_id, event_created_at asc);

create index if not exists manual_email_history_bulk_operation_id_idx
  on public.manual_email_history(bulk_operation_id) where bulk_operation_id is not null;

alter table public.manual_email_bulk_operations enable row level security;
alter table public.manual_email_history enable row level security;
alter table public.manual_email_events enable row level security;

revoke all on table public.manual_email_bulk_operations from anon, authenticated;
revoke all on table public.manual_email_history from anon, authenticated;
revoke all on table public.manual_email_events from anon, authenticated;

create table if not exists public.mailing_list_subscribers (
  id uuid primary key default gen_random_uuid(), email text not null, first_name text, last_name text,
  status text not null default 'active' check (status in ('active', 'unsubscribed')),
  source text not null default 'other' check (source in ('website', 'admin', 'ticket_opt_in', 'import', 'other')),
  metadata jsonb not null default '{}'::jsonb, subscribed_at timestamptz not null default now(), unsubscribed_at timestamptz,
  last_campaign_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index if not exists mailing_list_subscribers_email_lower_key on public.mailing_list_subscribers (lower(btrim(email)));
create index if not exists mailing_list_subscribers_status_idx on public.mailing_list_subscribers (status, created_at desc);
alter table public.mailing_list_subscribers enable row level security;
revoke all on public.mailing_list_subscribers from anon, authenticated;

create table if not exists public.mailing_list_presale_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.mailing_list_subscribers(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  recipient text not null,
  subject text not null,
  ticket_url_snapshot text not null,
  resend_message_id text,
  provider_idempotency_key text not null,
  send_status text not null default 'pending' check (send_status in ('pending', 'accepted', 'failed')),
  delivery_source text check (delivery_source is null or delivery_source in ('automatic_signup', 'scheduled_campaign')),
  error_message text,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mailing_list_presale_deliveries_subscriber_show_unique unique (subscriber_id, show_id),
  constraint mailing_list_presale_deliveries_provider_key_unique unique (provider_idempotency_key)
);
create unique index if not exists mailing_list_presale_deliveries_resend_id_unique
  on public.mailing_list_presale_deliveries(resend_message_id) where resend_message_id is not null;
create index if not exists mailing_list_presale_deliveries_show_created_idx
  on public.mailing_list_presale_deliveries(show_id, created_at desc);
alter table public.mailing_list_presale_deliveries enable row level security;
revoke all on table public.mailing_list_presale_deliveries from public, anon, authenticated;
grant all on table public.mailing_list_presale_deliveries to service_role;

create table if not exists public.mailing_list_presale_delivery_attempts (
  id uuid primary key,
  presale_delivery_id uuid not null references public.mailing_list_presale_deliveries(id) on delete cascade,
  request_id uuid not null unique,
  attempt_type text not null check (attempt_type in ('manual_resend')),
  recipient text not null,
  subject text not null,
  ticket_url_snapshot text not null,
  presale_code_snapshot text,
  rendered_text_snapshot text,
  administrative_reason text,
  provider_idempotency_key text not null unique,
  resend_message_id text,
  send_status text not null default 'pending' check (send_status in ('pending', 'accepted', 'failed')),
  error_message text,
  sent_at timestamptz,
  failed_at timestamptz,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists mailing_list_presale_delivery_attempts_resend_id_unique on public.mailing_list_presale_delivery_attempts(resend_message_id) where resend_message_id is not null;
create index if not exists mailing_list_presale_delivery_attempts_delivery_requested_idx on public.mailing_list_presale_delivery_attempts(presale_delivery_id, requested_at desc);
alter table public.mailing_list_presale_delivery_attempts enable row level security;
revoke all on table public.mailing_list_presale_delivery_attempts from public, anon, authenticated;
grant all on table public.mailing_list_presale_delivery_attempts to service_role;

create table if not exists public.mailing_list_presale_delivery_events (
  id uuid primary key default gen_random_uuid(),
  presale_delivery_id uuid not null references public.mailing_list_presale_deliveries(id) on delete cascade,
  presale_delivery_attempt_id uuid references public.mailing_list_presale_delivery_attempts(id) on delete cascade,
  resend_message_id text not null,
  event_type text not null check (event_type in ('email.sent', 'email.delivered', 'email.delivery_delayed', 'email.complained', 'email.bounced', 'email.opened', 'email.clicked', 'email.failed')),
  provider_event_id text,
  recipient text,
  provider_occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  clicked_url text,
  detail text,
  event_fingerprint text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists mailing_list_presale_delivery_events_fingerprint_unique on public.mailing_list_presale_delivery_events(event_fingerprint);
create index if not exists mailing_list_presale_delivery_events_delivery_occurred_idx on public.mailing_list_presale_delivery_events(presale_delivery_id, provider_occurred_at asc);
create index if not exists mailing_list_presale_delivery_events_attempt_occurred_idx on public.mailing_list_presale_delivery_events(presale_delivery_attempt_id, provider_occurred_at asc) where presale_delivery_attempt_id is not null;
alter table public.mailing_list_presale_delivery_events enable row level security;
revoke all on table public.mailing_list_presale_delivery_events from public, anon, authenticated;
grant all on table public.mailing_list_presale_delivery_events to service_role;

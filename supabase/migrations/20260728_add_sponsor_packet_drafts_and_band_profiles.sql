create table if not exists public.show_band_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null unique,
  display_name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.show_band_profile_members (
  id uuid primary key default gen_random_uuid(),
  band_profile_id uuid not null references public.show_band_profiles(id) on delete cascade,
  member_name text not null,
  role_text text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint show_band_profile_members_profile_name_key unique (band_profile_id, member_name)
);

create index if not exists show_band_profile_members_profile_order_idx
  on public.show_band_profile_members (band_profile_id, display_order, created_at);

create table if not exists public.sponsor_packet_drafts (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  sponsor_library_id uuid not null references public.sponsor_library(id) on delete cascade,
  draft_name text,
  packet_date date,
  sponsor_name_override text,
  contact_person text,
  greeting_name text,
  mailing_address_line_1 text,
  mailing_address_line_2 text,
  mailing_city text,
  mailing_state text,
  mailing_zip text,
  letter_heading text,
  personal_message text,
  additional_note text,
  closing_name text,
  closing_title text,
  contact_email text,
  contact_phone text,
  show_date_override date,
  doors_time_override text,
  show_time_override text,
  include_tickets boolean not null default false,
  ticket_quantity integer,
  admission_type text,
  assigned_seat_labels text[],
  seat_instructions text,
  ticket_enclosure_note text,
  enabled_sections jsonb not null default '{}'::jsonb,
  guest_name_override text,
  guest_bio_override text,
  guest_photo_url_override text,
  band_heading_override text,
  band_description_override text,
  band_members_override jsonb not null default '[]'::jsonb,
  sponsor_recognition_override text,
  venue_name_override text,
  venue_address_override text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_packet_drafts_show_sponsor_key unique (show_id, sponsor_library_id),
  constraint sponsor_packet_drafts_ticket_quantity_check check (ticket_quantity is null or ticket_quantity >= 0),
  constraint sponsor_packet_drafts_admission_type_check check (admission_type is null or admission_type in ('reserved', 'general'))
);

create index if not exists sponsor_packet_drafts_sponsor_idx
  on public.sponsor_packet_drafts (sponsor_library_id, updated_at desc);

alter table public.show_band_profiles enable row level security;
alter table public.show_band_profile_members enable row level security;
alter table public.sponsor_packet_drafts enable row level security;

revoke all on table public.show_band_profiles from public, anon, authenticated;
revoke all on table public.show_band_profile_members from public, anon, authenticated;
revoke all on table public.sponsor_packet_drafts from public, anon, authenticated;

grant select, insert, update, delete on table public.show_band_profiles to service_role;
grant select, insert, update, delete on table public.show_band_profile_members to service_role;
grant select, insert, update, delete on table public.sponsor_packet_drafts to service_role;

create policy "service role manages show band profiles"
  on public.show_band_profiles
  for all
  to service_role
  using (true)
  with check (true);

create policy "service role manages show band profile members"
  on public.show_band_profile_members
  for all
  to service_role
  using (true)
  with check (true);

create policy "service role manages sponsor packet drafts"
  on public.sponsor_packet_drafts
  for all
  to service_role
  using (true)
  with check (true);

insert into public.show_band_profiles (profile_key, display_name, description)
values (
  'cmms_house_band',
  'The Cumberland Mountain Music Show Band',
  'The Cumberland Mountain Music Show Band brings together some of the region''s finest musicians for an evening of bluegrass, gospel, classic country, and traditional Appalachian music.'
)
on conflict (profile_key) do nothing;

insert into public.show_band_profile_members (band_profile_id, member_name, role_text, display_order)
select profile.id, seed.member_name, seed.role_text, seed.display_order
from public.show_band_profiles profile
cross join (
  values
    ('Bryan Turner', 'Bass and Vocals', 1),
    ('Stuart Wyrick', 'Banjo and Vocals', 2),
    ('Justin Salyer', 'Guitar', 3),
    ('Sawyer Blankenship', 'Fiddle', 4),
    ('Clint Hurd', 'Mandolin', 5)
) as seed(member_name, role_text, display_order)
where profile.profile_key = 'cmms_house_band'
on conflict (band_profile_id, member_name) do nothing;

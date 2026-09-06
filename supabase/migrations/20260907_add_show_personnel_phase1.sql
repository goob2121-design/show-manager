create table if not exists public.personnel_profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  default_role text,
  default_pay_amount numeric(12,2) not null default 0,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personnel_profiles_display_name_nonblank check (btrim(display_name) <> ''),
  constraint personnel_profiles_default_pay_nonnegative check (default_pay_amount >= 0)
);

create unique index if not exists personnel_profiles_display_name_unique
  on public.personnel_profiles (lower(btrim(display_name)));

create index if not exists personnel_profiles_active_order_idx
  on public.personnel_profiles (is_active, display_order, display_name);

alter table public.personnel_profiles enable row level security;
revoke all on table public.personnel_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.personnel_profiles to service_role;

drop policy if exists "service role manages personnel profiles" on public.personnel_profiles;
create policy "service role manages personnel profiles"
  on public.personnel_profiles for all to service_role
  using (true) with check (true);

insert into public.personnel_profiles (display_name, default_role, default_pay_amount, display_order)
values
  ('Bryan Turner', 'Bass and Vocals', 0.00, 1),
  ('Stuart Wyrick', 'Banjo and Vocals', 0.00, 2),
  ('Justin Salyer', 'Guitar', 0.00, 3),
  ('Sawyer Blankenship', 'Fiddle', 0.00, 4),
  ('Clint Hurd', 'Mandolin', 0.00, 5),
  ('Gerald Mullins', 'MC', 0.00, 6)
on conflict do nothing;

alter table public.show_band_profile_members
  add column if not exists personnel_profile_id uuid
  references public.personnel_profiles(id) on delete set null;

update public.show_band_profile_members member
set personnel_profile_id = profile.id
from public.personnel_profiles profile, public.show_band_profiles band
where member.band_profile_id = band.id
  and band.profile_key = 'cmms_house_band'
  and lower(btrim(member.member_name)) = lower(btrim(profile.display_name))
  and member.personnel_profile_id is null;

alter table public.show_payout_items
  add column if not exists entry_kind text not null default 'general',
  add column if not exists personnel_profile_id uuid references public.personnel_profiles(id) on delete restrict,
  add column if not exists guest_profile_id uuid references public.guest_profiles(id) on delete set null,
  add column if not exists role_snapshot text,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_note text,
  add column if not exists display_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.show_payout_items
  drop constraint if exists show_payout_items_entry_kind_check;
alter table public.show_payout_items
  add constraint show_payout_items_entry_kind_check
  check (entry_kind in ('general', 'personnel'));
alter table public.show_payout_items
  drop constraint if exists show_payout_items_amount_nonnegative;
alter table public.show_payout_items
  add constraint show_payout_items_amount_nonnegative check (amount >= 0) not valid;

create unique index if not exists show_payout_items_personnel_profile_unique
  on public.show_payout_items (show_id, personnel_profile_id)
  where entry_kind = 'personnel' and personnel_profile_id is not null;

create unique index if not exists show_payout_items_personnel_guest_unique
  on public.show_payout_items (show_id, guest_profile_id)
  where entry_kind = 'personnel' and guest_profile_id is not null;

create index if not exists show_payout_items_personnel_order_idx
  on public.show_payout_items (show_id, entry_kind, display_order, created_at);

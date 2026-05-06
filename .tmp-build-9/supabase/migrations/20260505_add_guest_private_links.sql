alter table public.guest_profiles
  add column if not exists guest_token text,
  add column if not exists portal_opened_at timestamptz,
  add column if not exists last_reminder_sent_at timestamptz;

update public.guest_profiles
set guest_token = gen_random_uuid()::text
where guest_token is null;

create unique index if not exists guest_profiles_guest_token_unique
  on public.guest_profiles(guest_token)
  where guest_token is not null;

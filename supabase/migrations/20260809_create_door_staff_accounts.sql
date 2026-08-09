create table if not exists public.door_staff_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null check (length(username) between 1 and 100 and username = lower(trim(username))),
  password_hash text not null check (password_hash like 'scrypt$%'),
  show_id uuid not null references public.shows(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists door_staff_accounts_show_username_unique
  on public.door_staff_accounts (show_id, lower(trim(username)));

create or replace function public.set_door_staff_account_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists door_staff_accounts_set_updated_at on public.door_staff_accounts;
create trigger door_staff_accounts_set_updated_at
before update on public.door_staff_accounts
for each row execute function public.set_door_staff_account_updated_at();

revoke all on public.door_staff_accounts from anon;
revoke all on public.door_staff_accounts from authenticated;

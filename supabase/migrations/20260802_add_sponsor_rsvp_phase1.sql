create or replace function public.generate_sponsor_code()
returns text language plpgsql set search_path = public as $$
declare
  allowed_letters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text;
begin
  for attempt in 1..200 loop
    candidate := substr(allowed_letters, 1 + floor(random() * length(allowed_letters))::integer, 1)
      || substr(allowed_letters, 1 + floor(random() * length(allowed_letters))::integer, 1)
      || lpad(floor(random() * 100)::integer::text, 2, '0');
    if not exists (select 1 from public.sponsor_library where upper(sponsor_code) = candidate) then return candidate; end if;
  end loop;
  raise exception 'Unable to generate a unique Sponsor ID';
end;
$$;

alter table public.sponsor_library add column if not exists sponsor_code text;
update public.sponsor_library set sponsor_code = public.generate_sponsor_code() where sponsor_code is null;
alter table public.sponsor_library
  alter column sponsor_code set default public.generate_sponsor_code(),
  alter column sponsor_code set not null,
  add constraint sponsor_library_sponsor_code_format_check check (sponsor_code = upper(sponsor_code) and sponsor_code ~ '^[A-HJ-NP-Z]{2}[0-9]{2}$'),
  add constraint sponsor_library_sponsor_code_unique unique (sponsor_code);

create or replace function public.preserve_sponsor_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.sponsor_code is null then new.sponsor_code := public.generate_sponsor_code();
  elsif tg_op = 'UPDATE' and new.sponsor_code is distinct from old.sponsor_code then raise exception 'Sponsor ID cannot be changed';
  end if;
  new.sponsor_code := upper(new.sponsor_code);
  return new;
end;
$$;

drop trigger if exists sponsor_library_preserve_sponsor_code on public.sponsor_library;
create trigger sponsor_library_preserve_sponsor_code before insert or update of sponsor_code on public.sponsor_library
for each row execute function public.preserve_sponsor_code();

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
create index if not exists sponsor_show_rsvps_show_status_idx on public.sponsor_show_rsvps(show_id, status);
alter table public.sponsor_show_rsvps enable row level security;
revoke all on public.sponsor_show_rsvps from anon;
revoke all on public.sponsor_show_rsvps from authenticated;

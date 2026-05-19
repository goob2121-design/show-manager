create table if not exists public.show_comp_tickets (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  guest_name text not null,
  ticket_count integer not null default 1,
  notes text,
  checked_in boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists show_comp_tickets_show_id_created_at_idx
  on public.show_comp_tickets(show_id, created_at);

alter table public.show_comp_tickets enable row level security;

do $$
begin
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

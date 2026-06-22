create table if not exists public.show_reserved_seating_links (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  customer_name text not null,
  email text,
  ticket_count integer not null default 1,
  selection_token text not null default gen_random_uuid()::text,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists show_reserved_seating_links_selection_token_unique
  on public.show_reserved_seating_links(selection_token);

create index if not exists show_reserved_seating_links_show_id_created_at_idx
  on public.show_reserved_seating_links(show_id, created_at desc);

create table if not exists public.show_reserved_seat_assignments (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  seating_link_id uuid references public.show_reserved_seating_links(id) on delete set null,
  customer_name text,
  email text,
  seat_id text not null,
  section text not null,
  row_label text not null,
  seat_number integer not null,
  assignment_type text not null default 'customer',
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists show_reserved_seat_assignments_show_id_seat_id_unique
  on public.show_reserved_seat_assignments(show_id, seat_id);

create index if not exists show_reserved_seat_assignments_show_id_created_at_idx
  on public.show_reserved_seat_assignments(show_id, created_at asc);

alter table public.show_reserved_seating_links enable row level security;
alter table public.show_reserved_seat_assignments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'show_reserved_seat_assignments_assignment_type_check'
  ) then
    alter table public.show_reserved_seat_assignments
      add constraint show_reserved_seat_assignments_assignment_type_check
      check (assignment_type in ('customer', 'blocked'));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_reserved_seating_links'
      and policyname = 'Allow public read reserved seating links'
  ) then
    create policy "Allow public read reserved seating links"
      on public.show_reserved_seating_links
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_reserved_seating_links'
      and policyname = 'Allow public insert reserved seating links'
  ) then
    create policy "Allow public insert reserved seating links"
      on public.show_reserved_seating_links
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_reserved_seating_links'
      and policyname = 'Allow public update reserved seating links'
  ) then
    create policy "Allow public update reserved seating links"
      on public.show_reserved_seating_links
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_reserved_seating_links'
      and policyname = 'Allow public delete reserved seating links'
  ) then
    create policy "Allow public delete reserved seating links"
      on public.show_reserved_seating_links
      for delete
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_reserved_seat_assignments'
      and policyname = 'Allow public read reserved seat assignments'
  ) then
    create policy "Allow public read reserved seat assignments"
      on public.show_reserved_seat_assignments
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_reserved_seat_assignments'
      and policyname = 'Allow public insert reserved seat assignments'
  ) then
    create policy "Allow public insert reserved seat assignments"
      on public.show_reserved_seat_assignments
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_reserved_seat_assignments'
      and policyname = 'Allow public update reserved seat assignments'
  ) then
    create policy "Allow public update reserved seat assignments"
      on public.show_reserved_seat_assignments
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'show_reserved_seat_assignments'
      and policyname = 'Allow public delete reserved seat assignments'
  ) then
    create policy "Allow public delete reserved seat assignments"
      on public.show_reserved_seat_assignments
      for delete
      to anon, authenticated
      using (true);
  end if;
end
$$;

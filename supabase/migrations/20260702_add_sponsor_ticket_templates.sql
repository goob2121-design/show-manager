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

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Sponsor ticket templates are publicly readable'
  ) then
    create policy "Sponsor ticket templates are publicly readable"
      on storage.objects
      for select
      to public
      using (bucket_id = 'sponsor-ticket-templates');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Sponsor ticket templates can be uploaded by authenticated users'
  ) then
    create policy "Sponsor ticket templates can be uploaded by authenticated users"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'sponsor-ticket-templates');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Sponsor ticket templates can be updated by authenticated users'
  ) then
    create policy "Sponsor ticket templates can be updated by authenticated users"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'sponsor-ticket-templates')
      with check (bucket_id = 'sponsor-ticket-templates');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Sponsor ticket templates can be deleted by authenticated users'
  ) then
    create policy "Sponsor ticket templates can be deleted by authenticated users"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'sponsor-ticket-templates');
  end if;
end
$$;

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
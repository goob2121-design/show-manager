create table if not exists public.show_checklist_items (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  task text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists show_checklist_items_show_id_created_at_idx
  on public.show_checklist_items(show_id, created_at);

alter table public.show_checklist_items enable row level security;

drop policy if exists "Allow public read show checklist items" on public.show_checklist_items;
drop policy if exists "Allow public insert show checklist items" on public.show_checklist_items;
drop policy if exists "Allow public update show checklist items" on public.show_checklist_items;
drop policy if exists "Allow public delete show checklist items" on public.show_checklist_items;

create policy "Allow public read show checklist items"
on public.show_checklist_items
for select
to anon, authenticated
using (true);

create policy "Allow public insert show checklist items"
on public.show_checklist_items
for insert
to anon, authenticated
with check (true);

create policy "Allow public update show checklist items"
on public.show_checklist_items
for update
to anon, authenticated
using (true)
with check (true);

create policy "Allow public delete show checklist items"
on public.show_checklist_items
for delete
to anon, authenticated
using (true);

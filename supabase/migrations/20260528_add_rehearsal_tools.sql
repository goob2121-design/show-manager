create table if not exists public.rehearsal_entries (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  song_id uuid references public.songs(id) on delete set null,
  custom_title text,
  notes text,
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

alter table public.rehearsal_entries enable row level security;
alter table public.rehearsal_recordings enable row level security;

drop policy if exists "Allow public read rehearsal entries" on public.rehearsal_entries;
drop policy if exists "Allow public insert rehearsal entries" on public.rehearsal_entries;
drop policy if exists "Allow public update rehearsal entries" on public.rehearsal_entries;
drop policy if exists "Allow public delete rehearsal entries" on public.rehearsal_entries;

create policy "Allow public read rehearsal entries"
on public.rehearsal_entries
for select
to anon, authenticated
using (true);

create policy "Allow public insert rehearsal entries"
on public.rehearsal_entries
for insert
to anon, authenticated
with check (true);

create policy "Allow public update rehearsal entries"
on public.rehearsal_entries
for update
to anon, authenticated
using (true)
with check (true);

create policy "Allow public delete rehearsal entries"
on public.rehearsal_entries
for delete
to anon, authenticated
using (true);

drop policy if exists "Allow public read rehearsal recordings" on public.rehearsal_recordings;
drop policy if exists "Allow public insert rehearsal recordings" on public.rehearsal_recordings;
drop policy if exists "Allow public update rehearsal recordings" on public.rehearsal_recordings;
drop policy if exists "Allow public delete rehearsal recordings" on public.rehearsal_recordings;

create policy "Allow public read rehearsal recordings"
on public.rehearsal_recordings
for select
to anon, authenticated
using (true);

create policy "Allow public insert rehearsal recordings"
on public.rehearsal_recordings
for insert
to anon, authenticated
with check (true);

create policy "Allow public update rehearsal recordings"
on public.rehearsal_recordings
for update
to anon, authenticated
using (true)
with check (true);

create policy "Allow public delete rehearsal recordings"
on public.rehearsal_recordings
for delete
to anon, authenticated
using (true);

insert into storage.buckets (id, name, public)
values ('rehearsal-recordings', 'rehearsal-recordings', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Rehearsal recordings are publicly readable" on storage.objects;
drop policy if exists "Rehearsal recordings can be uploaded publicly" on storage.objects;
drop policy if exists "Rehearsal recordings can be updated publicly" on storage.objects;
drop policy if exists "Rehearsal recordings can be deleted publicly" on storage.objects;

create policy "Rehearsal recordings are publicly readable"
on storage.objects
for select
to public
using (bucket_id = 'rehearsal-recordings');

create policy "Rehearsal recordings can be uploaded publicly"
on storage.objects
for insert
to public
with check (bucket_id = 'rehearsal-recordings');

create policy "Rehearsal recordings can be updated publicly"
on storage.objects
for update
to public
using (bucket_id = 'rehearsal-recordings')
with check (bucket_id = 'rehearsal-recordings');

create policy "Rehearsal recordings can be deleted publicly"
on storage.objects
for delete
to public
using (bucket_id = 'rehearsal-recordings');

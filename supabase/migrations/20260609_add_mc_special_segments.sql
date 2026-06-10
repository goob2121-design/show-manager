create table if not exists public.mc_special_segments (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  title text not null,
  notes text,
  placement_type text,
  anchor_song_id uuid references public.setlist_entries(id) on delete set null,
  placement_order integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists mc_special_segments_show_id_order_idx
  on public.mc_special_segments(show_id, placement_order, created_at);

alter table public.mc_special_segments enable row level security;

drop policy if exists "Allow public read mc special segments" on public.mc_special_segments;
drop policy if exists "Allow public insert mc special segments" on public.mc_special_segments;
drop policy if exists "Allow public update mc special segments" on public.mc_special_segments;
drop policy if exists "Allow public delete mc special segments" on public.mc_special_segments;

create policy "Allow public read mc special segments"
on public.mc_special_segments
for select
to anon, authenticated
using (true);

create policy "Allow public insert mc special segments"
on public.mc_special_segments
for insert
to anon, authenticated
with check (true);

create policy "Allow public update mc special segments"
on public.mc_special_segments
for update
to anon, authenticated
using (true)
with check (true);

create policy "Allow public delete mc special segments"
on public.mc_special_segments
for delete
to anon, authenticated
using (true);

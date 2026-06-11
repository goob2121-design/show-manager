create table if not exists public.mc_sponsor_reads (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  show_sponsor_id uuid not null references public.show_sponsors(id) on delete cascade,
  placement_order integer not null default 1,
  placement_type text,
  anchor_song_id uuid references public.setlist_entries(id) on delete set null,
  linked_performer text,
  custom_note text,
  created_at timestamptz not null default now()
);

create index if not exists mc_sponsor_reads_show_id_order_idx
  on public.mc_sponsor_reads(show_id, placement_order, created_at);

create index if not exists mc_sponsor_reads_show_sponsor_id_idx
  on public.mc_sponsor_reads(show_sponsor_id);

alter table public.mc_sponsor_reads enable row level security;

drop policy if exists "Allow public read mc sponsor reads" on public.mc_sponsor_reads;
drop policy if exists "Allow public insert mc sponsor reads" on public.mc_sponsor_reads;
drop policy if exists "Allow public update mc sponsor reads" on public.mc_sponsor_reads;
drop policy if exists "Allow public delete mc sponsor reads" on public.mc_sponsor_reads;

create policy "Allow public read mc sponsor reads"
on public.mc_sponsor_reads
for select
to anon, authenticated
using (true);

create policy "Allow public insert mc sponsor reads"
on public.mc_sponsor_reads
for insert
to anon, authenticated
with check (true);

create policy "Allow public update mc sponsor reads"
on public.mc_sponsor_reads
for update
to anon, authenticated
using (true)
with check (true);

create policy "Allow public delete mc sponsor reads"
on public.mc_sponsor_reads
for delete
to anon, authenticated
using (true);

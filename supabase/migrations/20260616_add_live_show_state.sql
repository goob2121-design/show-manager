create table if not exists public.live_show_state (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  current_song_index integer not null default 0,
  current_set_number integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists live_show_state_show_id_unique
  on public.live_show_state(show_id);

alter table public.live_show_state enable row level security;

drop policy if exists "Allow public read live show state" on public.live_show_state;
drop policy if exists "Allow public insert live show state" on public.live_show_state;
drop policy if exists "Allow public update live show state" on public.live_show_state;
drop policy if exists "Allow public delete live show state" on public.live_show_state;

create policy "Allow public read live show state"
on public.live_show_state
for select
to anon, authenticated
using (true);

create policy "Allow public insert live show state"
on public.live_show_state
for insert
to anon, authenticated
with check (true);

create policy "Allow public update live show state"
on public.live_show_state
for update
to anon, authenticated
using (true)
with check (true);

create policy "Allow public delete live show state"
on public.live_show_state
for delete
to anon, authenticated
using (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_show_state'
  ) then
    alter publication supabase_realtime add table public.live_show_state;
  end if;
end
$$;

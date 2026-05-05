create extension if not exists pgcrypto;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  key text,
  tempo text check (tempo in ('fast', 'medium', 'slow')),
  song_type text check (song_type in ('vocal', 'instrumental')),
  notes text,
  lyrics text,
  created_by_role text not null check (created_by_role in ('band', 'admin')),
  created_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.show_guest_songs (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  title text not null,
  key text,
  tempo text check (tempo in ('fast', 'medium', 'slow')),
  song_type text check (song_type in ('vocal', 'instrumental')),
  submitted_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.setlist_entries (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  section text not null check (section in ('set1', 'set2', 'encore')),
  position integer not null,
  source_type text not null check (source_type in ('library', 'guest')),
  song_id uuid references public.songs(id),
  guest_song_id uuid references public.show_guest_songs(id) on delete cascade,
  custom_title text,
  created_at timestamptz not null default now(),
  constraint setlist_entries_source_reference_check check (
    (source_type = 'library' and song_id is not null and guest_song_id is null) or
    (source_type = 'guest' and guest_song_id is not null and song_id is null)
  )
);

create unique index if not exists songs_title_key_unique
  on public.songs(lower(title), lower(coalesce(key, '')));

create index if not exists show_guest_songs_show_id_created_at_idx
  on public.show_guest_songs(show_id, created_at);

create index if not exists setlist_entries_show_id_position_idx
  on public.setlist_entries(show_id, section, position);

insert into public.songs (
  id,
  title,
  key,
  tempo,
  song_type,
  notes,
  lyrics,
  created_by_role,
  created_by_name,
  created_at
)
select
  library_song.id,
  library_song.title,
  nullif(library_song.song_key, ''),
  null,
  null,
  library_song.notes,
  library_song.lyrics,
  case
    when lower(coalesce(library_song.source_role, '')) = 'band' then 'band'
    else 'admin'
  end,
  null,
  library_song.created_at
from public.song_library as library_song
on conflict (id) do update
set
  title = excluded.title,
  key = excluded.key,
  notes = excluded.notes,
  lyrics = excluded.lyrics,
  created_by_role = excluded.created_by_role,
  created_at = excluded.created_at;

insert into public.songs (
  id,
  title,
  key,
  tempo,
  song_type,
  notes,
  lyrics,
  created_by_role,
  created_by_name,
  created_at
)
select
  submission.id,
  submission.title,
  nullif(submission.song_key, ''),
  null,
  null,
  submission.notes,
  submission.lyrics,
  case
    when lower(coalesce(submission.submitted_by_role, '')) = 'band' then 'band'
    else 'admin'
  end,
  nullif(submission.submitted_by_name, ''),
  submission.created_at
from public.pending_submissions as submission
where lower(coalesce(submission.submitted_by_role, '')) in ('band', 'admin')
on conflict do nothing;

insert into public.songs (
  id,
  title,
  key,
  tempo,
  song_type,
  notes,
  lyrics,
  created_by_role,
  created_by_name,
  created_at
)
select
  legacy_setlist_song.id,
  legacy_setlist_song.title,
  nullif(legacy_setlist_song.song_key, ''),
  null,
  null,
  legacy_setlist_song.notes,
  legacy_setlist_song.lyrics,
  case
    when lower(coalesce(legacy_setlist_song.source_role, '')) = 'band' then 'band'
    else 'admin'
  end,
  null,
  legacy_setlist_song.created_at
from public.setlist_songs as legacy_setlist_song
where lower(coalesce(legacy_setlist_song.source_role, '')) <> 'guest'
on conflict do nothing;

insert into public.show_guest_songs (
  id,
  show_id,
  title,
  key,
  tempo,
  song_type,
  submitted_by_name,
  created_at
)
select
  submission.id,
  submission.show_id,
  submission.title,
  nullif(submission.song_key, ''),
  null,
  null,
  nullif(submission.submitted_by_name, ''),
  submission.created_at
from public.pending_submissions as submission
where lower(coalesce(submission.submitted_by_role, '')) = 'guest'
on conflict (id) do update
set
  title = excluded.title,
  key = excluded.key,
  submitted_by_name = excluded.submitted_by_name,
  created_at = excluded.created_at;

insert into public.show_guest_songs (
  id,
  show_id,
  title,
  key,
  tempo,
  song_type,
  submitted_by_name,
  created_at
)
select
  legacy_setlist_song.id,
  legacy_setlist_song.show_id,
  legacy_setlist_song.title,
  nullif(legacy_setlist_song.song_key, ''),
  null,
  null,
  nullif(legacy_setlist_song.artist, ''),
  legacy_setlist_song.created_at
from public.setlist_songs as legacy_setlist_song
where lower(coalesce(legacy_setlist_song.source_role, '')) = 'guest'
  and not exists (
    select 1
    from public.show_guest_songs as guest_song
    where guest_song.show_id = legacy_setlist_song.show_id
      and lower(guest_song.title) = lower(legacy_setlist_song.title)
      and lower(coalesce(guest_song.key, '')) = lower(coalesce(legacy_setlist_song.song_key, ''))
      and lower(coalesce(guest_song.submitted_by_name, '')) = lower(coalesce(legacy_setlist_song.artist, ''))
  )
on conflict do nothing;

insert into public.setlist_entries (
  id,
  show_id,
  section,
  position,
  source_type,
  song_id,
  guest_song_id,
  custom_title,
  created_at
)
select
  legacy_setlist_song.id,
  legacy_setlist_song.show_id,
  case
    when legacy_setlist_song.set_section in ('set2', 'encore') then legacy_setlist_song.set_section
    else 'set1'
  end,
  legacy_setlist_song.position,
  case
    when lower(coalesce(legacy_setlist_song.source_role, '')) = 'guest' then 'guest'
    else 'library'
  end,
  case
    when lower(coalesce(legacy_setlist_song.source_role, '')) = 'guest' then null
    else library_match.song_id
  end,
  case
    when lower(coalesce(legacy_setlist_song.source_role, '')) = 'guest' then guest_match.guest_song_id
    else null
  end,
  case
    when lower(coalesce(legacy_setlist_song.source_role, '')) = 'guest'
      and guest_match.guest_title is distinct from legacy_setlist_song.title
      then legacy_setlist_song.title
    when lower(coalesce(legacy_setlist_song.source_role, '')) <> 'guest'
      and library_match.song_title is distinct from legacy_setlist_song.title
      then legacy_setlist_song.title
    else null
  end,
  legacy_setlist_song.created_at
from public.setlist_songs as legacy_setlist_song
left join lateral (
  select
    song.id as song_id,
    song.title as song_title
  from public.songs as song
  where song.id = legacy_setlist_song.id
     or (
      lower(song.title) = lower(legacy_setlist_song.title)
      and lower(coalesce(song.key, '')) = lower(coalesce(legacy_setlist_song.song_key, ''))
    )
  order by
    case when song.id = legacy_setlist_song.id then 0 else 1 end,
    song.created_at asc
  limit 1
) as library_match on true
left join lateral (
  select
    guest_song.id as guest_song_id,
    guest_song.title as guest_title
  from public.show_guest_songs as guest_song
  where guest_song.id = legacy_setlist_song.id
     or (
      guest_song.show_id = legacy_setlist_song.show_id
      and lower(guest_song.title) = lower(legacy_setlist_song.title)
      and lower(coalesce(guest_song.key, '')) = lower(coalesce(legacy_setlist_song.song_key, ''))
      and lower(coalesce(guest_song.submitted_by_name, '')) = lower(coalesce(legacy_setlist_song.artist, ''))
    )
  order by
    case when guest_song.id = legacy_setlist_song.id then 0 else 1 end,
    guest_song.created_at asc
  limit 1
) as guest_match on true
where not exists (
    select 1
    from public.setlist_entries as entry
    where entry.id = legacy_setlist_song.id
  )
  and (
    (
      lower(coalesce(legacy_setlist_song.source_role, '')) = 'guest'
      and guest_match.guest_song_id is not null
    )
    or (
      lower(coalesce(legacy_setlist_song.source_role, '')) <> 'guest'
      and library_match.song_id is not null
    )
  );

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select tc.constraint_name
    from information_schema.table_constraints as tc
    join information_schema.key_column_usage as kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and tc.table_name = 'show_sponsors'
      and kcu.column_name = 'mc_anchor_song_id'
  loop
    execute format('alter table public.show_sponsors drop constraint %I', constraint_name);
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'show_sponsors_mc_anchor_song_id_fkey'
      and conrelid = 'public.show_sponsors'::regclass
  ) then
    alter table public.show_sponsors
      add constraint show_sponsors_mc_anchor_song_id_fkey
      foreign key (mc_anchor_song_id)
      references public.setlist_entries(id)
      on delete set null;
  end if;
end
$$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select tc.constraint_name
    from information_schema.table_constraints as tc
    join information_schema.key_column_usage as kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and tc.table_name = 'mc_block_notes'
      and kcu.column_name = 'anchor_song_id'
  loop
    execute format('alter table public.mc_block_notes drop constraint %I', constraint_name);
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'mc_block_notes_anchor_song_id_fkey'
      and conrelid = 'public.mc_block_notes'::regclass
  ) then
    alter table public.mc_block_notes
      add constraint mc_block_notes_anchor_song_id_fkey
      foreign key (anchor_song_id)
      references public.setlist_entries(id)
      on delete cascade;
  end if;
end
$$;

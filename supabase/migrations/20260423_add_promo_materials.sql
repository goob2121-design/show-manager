create table if not exists public.promo_materials (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'other' check (
    category in ('flyer', 'social_graphic', 'poster', 'sponsor_graphic', 'logo', 'promo_photo', 'other')
  ),
  file_name text not null,
  file_path text not null,
  file_url text not null,
  file_mime_type text,
  file_size bigint,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promo_materials_show_id_created_at_idx
  on public.promo_materials(show_id, created_at);

create index if not exists promo_materials_show_id_visible_idx
  on public.promo_materials(show_id, is_visible);

insert into storage.buckets (id, name, public)
values ('promo-materials', 'promo-materials', true)
on conflict (id) do update
set public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Promo materials are publicly readable'
  ) then
    create policy "Promo materials are publicly readable"
      on storage.objects
      for select
      to public
      using (bucket_id = 'promo-materials');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Promo materials can be uploaded publicly'
  ) then
    create policy "Promo materials can be uploaded publicly"
      on storage.objects
      for insert
      to public
      with check (bucket_id = 'promo-materials');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Promo materials can be updated publicly'
  ) then
    create policy "Promo materials can be updated publicly"
      on storage.objects
      for update
      to public
      using (bucket_id = 'promo-materials')
      with check (bucket_id = 'promo-materials');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Promo materials can be deleted publicly'
  ) then
    create policy "Promo materials can be deleted publicly"
      on storage.objects
      for delete
      to public
      using (bucket_id = 'promo-materials');
  end if;
end
$$;

create table if not exists public.print_studio_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  template_kind text not null default 'ticket',
  width_inches numeric not null,
  height_inches numeric not null,
  orientation text not null,
  background_path text,
  template_data jsonb not null,
  batch_defaults jsonb,
  schema_version integer not null default 1,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_studio_templates_name_not_blank check (btrim(name) <> ''),
  constraint print_studio_templates_width_positive check (width_inches > 0),
  constraint print_studio_templates_height_positive check (height_inches > 0),
  constraint print_studio_templates_orientation_check check (orientation in ('portrait', 'landscape')),
  constraint print_studio_templates_background_path_check check (background_path is null or background_path like 'templates/%')
);

create index if not exists print_studio_templates_archived_updated_at_idx
  on public.print_studio_templates(is_archived, updated_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('print-studio-backgrounds', 'print-studio-backgrounds', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.print_studio_templates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'print_studio_templates'
      and policyname = 'Print Studio templates are server API only'
  ) then
    create policy "Print Studio templates are server API only"
      on public.print_studio_templates
      for all
      using (false)
      with check (false);
  end if;
end
$$;
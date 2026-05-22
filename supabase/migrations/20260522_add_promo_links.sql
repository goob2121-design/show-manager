create table if not exists public.promo_links (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  title text not null,
  url text not null,
  link_type text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promo_links_show_id_created_at_idx
  on public.promo_links(show_id, created_at);

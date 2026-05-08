create table if not exists public.show_finance_items (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  category text,
  label text not null,
  amount numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists show_finance_items_show_id_created_at_idx
  on public.show_finance_items(show_id, created_at);

create index if not exists show_finance_items_show_id_type_idx
  on public.show_finance_items(show_id, type);

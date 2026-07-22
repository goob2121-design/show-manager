create table if not exists public.square_pending_checkouts (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  environment text not null default 'sandbox',
  square_payment_link_id text,
  square_order_id text,
  square_payment_id text,
  purchaser_name text not null,
  purchaser_email text not null,
  ticket_count integer not null,
  catalog_variation_id text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  imported_ticket_id uuid references public.show_comp_tickets(id) on delete set null,
  sanitized_error text,
  constraint square_pending_checkouts_environment_check check (environment = 'sandbox'),
  constraint square_pending_checkouts_ticket_count_check check (ticket_count between 1 and 20),
  constraint square_pending_checkouts_purchaser_email_check check (btrim(purchaser_email) <> ''),
  constraint square_pending_checkouts_purchaser_name_check check (btrim(purchaser_name) <> '')
);

create unique index if not exists square_pending_checkouts_payment_link_unique
  on public.square_pending_checkouts(square_payment_link_id)
  where square_payment_link_id is not null and btrim(square_payment_link_id) <> '';

create unique index if not exists square_pending_checkouts_order_unique
  on public.square_pending_checkouts(square_order_id)
  where square_order_id is not null and btrim(square_order_id) <> '';

create unique index if not exists square_pending_checkouts_payment_unique
  on public.square_pending_checkouts(square_payment_id)
  where square_payment_id is not null and btrim(square_payment_id) <> '';

create index if not exists square_pending_checkouts_show_created_idx
  on public.square_pending_checkouts(show_id, created_at desc);

alter table public.square_pending_checkouts enable row level security;
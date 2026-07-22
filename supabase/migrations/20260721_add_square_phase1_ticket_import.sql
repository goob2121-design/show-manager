alter table public.shows
  add column if not exists square_catalog_variation_id text;

create unique index if not exists shows_square_catalog_variation_id_unique
  on public.shows(square_catalog_variation_id)
  where square_catalog_variation_id is not null and btrim(square_catalog_variation_id) <> '';

alter table public.show_comp_tickets
  add column if not exists external_source text,
  add column if not exists external_event_id text,
  add column if not exists external_payment_id text,
  add column if not exists external_order_id text,
  add column if not exists external_line_item_uid text,
  add column if not exists external_catalog_variation_id text,
  add column if not exists external_status text,
  add column if not exists external_payload_summary jsonb,
  add column if not exists imported_at timestamptz;

create unique index if not exists show_comp_tickets_external_line_item_unique
  on public.show_comp_tickets(external_source, external_payment_id, external_order_id, external_line_item_uid)
  where external_source is not null
    and external_payment_id is not null
    and external_order_id is not null
    and external_line_item_uid is not null;

create index if not exists show_comp_tickets_external_order_idx
  on public.show_comp_tickets(external_source, external_order_id)
  where external_source is not null and external_order_id is not null;

create index if not exists show_comp_tickets_external_event_idx
  on public.show_comp_tickets(external_source, external_event_id)
  where external_source is not null and external_event_id is not null;

create table if not exists public.square_ticket_import_events (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  event_type text,
  payment_id text,
  order_id text,
  line_item_uid text,
  catalog_variation_id text,
  show_id uuid references public.shows(id) on delete set null,
  show_name text,
  result text not null,
  ticket_count integer,
  email_present boolean not null default false,
  seat_link_created boolean not null default false,
  email_sent boolean not null default false,
  error_message text,
  payload_summary jsonb,
  received_at timestamptz not null default now(),
  imported_at timestamptz
);

create index if not exists square_ticket_import_events_received_at_idx
  on public.square_ticket_import_events(received_at desc);

create index if not exists square_ticket_import_events_show_id_idx
  on public.square_ticket_import_events(show_id, received_at desc);

create unique index if not exists square_ticket_import_events_line_item_unique
  on public.square_ticket_import_events(event_id, payment_id, order_id, line_item_uid)
  where event_id is not null
    and payment_id is not null
    and order_id is not null
    and line_item_uid is not null;

alter table public.square_ticket_import_events enable row level security;
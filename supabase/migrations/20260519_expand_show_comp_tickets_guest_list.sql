alter table public.show_comp_tickets
  add column if not exists email text,
  add column if not exists ticket_type text not null default 'complimentary',
  add column if not exists order_id text;

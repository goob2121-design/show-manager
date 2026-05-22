alter table public.show_sponsors
  add column if not exists comp_ticket_allowance integer not null default 0,
  add column if not exists comp_tickets_checked_in integer not null default 0;

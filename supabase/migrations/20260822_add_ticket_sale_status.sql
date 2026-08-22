alter table public.shows
  add column if not exists ticket_sale_status text,
  add column if not exists presale_starts_at timestamptz,
  add column if not exists public_sale_starts_at timestamptz;

update public.shows
set ticket_sale_status = 'public'
where ticket_sale_status is null;

alter table public.shows
  alter column ticket_sale_status set default 'public',
  alter column ticket_sale_status set not null;

alter table public.shows
  drop constraint if exists shows_ticket_sale_status_check;

alter table public.shows
  add constraint shows_ticket_sale_status_check
  check (ticket_sale_status in ('not_on_sale', 'presale', 'public'));

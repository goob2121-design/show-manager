alter table public.shows
  add column if not exists promo_short text,
  add column if not exists promo_long text,
  add column if not exists ticket_link text;

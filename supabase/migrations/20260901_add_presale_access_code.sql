alter table public.shows
  add column if not exists presale_access_code text;

alter table public.scheduled_presale_campaigns
  add column if not exists presale_access_code_snapshot text;

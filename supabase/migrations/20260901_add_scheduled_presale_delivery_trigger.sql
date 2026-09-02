alter table public.scheduled_presale_campaigns
  add column if not exists delivery_trigger text,
  add column if not exists manually_sent_at timestamptz;

alter table public.scheduled_presale_campaigns
  drop constraint if exists scheduled_presale_campaigns_delivery_trigger_check;

alter table public.scheduled_presale_campaigns
  add constraint scheduled_presale_campaigns_delivery_trigger_check
  check (delivery_trigger is null or delivery_trigger in ('automatic', 'manual'));

comment on column public.scheduled_presale_campaigns.delivery_trigger is
  'Canonical execution source for a claimed campaign: automatic cron or authenticated manual Send Now.';

comment on column public.scheduled_presale_campaigns.manually_sent_at is
  'Actual completion timestamp when the canonical scheduled campaign was delivered through Send Now.';

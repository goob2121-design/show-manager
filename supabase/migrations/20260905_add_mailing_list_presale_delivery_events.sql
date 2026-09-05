alter table public.mailing_list_presale_deliveries
  add column if not exists delivery_source text;

alter table public.mailing_list_presale_deliveries
  drop constraint if exists mailing_list_presale_deliveries_delivery_source_check;

alter table public.mailing_list_presale_deliveries
  add constraint mailing_list_presale_deliveries_delivery_source_check
  check (delivery_source is null or delivery_source in ('automatic_signup', 'scheduled_campaign'));

create table if not exists public.mailing_list_presale_delivery_events (
  id uuid primary key default gen_random_uuid(),
  presale_delivery_id uuid not null references public.mailing_list_presale_deliveries(id) on delete cascade,
  resend_message_id text not null,
  event_type text not null check (event_type in (
    'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.complained',
    'email.bounced', 'email.opened', 'email.clicked', 'email.failed'
  )),
  provider_event_id text,
  recipient text,
  provider_occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  clicked_url text,
  detail text,
  event_fingerprint text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists mailing_list_presale_delivery_events_fingerprint_unique
  on public.mailing_list_presale_delivery_events(event_fingerprint);

create index if not exists mailing_list_presale_delivery_events_delivery_occurred_idx
  on public.mailing_list_presale_delivery_events(presale_delivery_id, provider_occurred_at asc);

alter table public.mailing_list_presale_delivery_events enable row level security;
revoke all on table public.mailing_list_presale_delivery_events from public, anon, authenticated;
grant all on table public.mailing_list_presale_delivery_events to service_role;

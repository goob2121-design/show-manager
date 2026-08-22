create table if not exists public.mailing_list_presale_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.mailing_list_subscribers(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  recipient text not null,
  subject text not null,
  ticket_url_snapshot text not null,
  resend_message_id text,
  provider_idempotency_key text not null,
  send_status text not null default 'pending'
    check (send_status in ('pending', 'accepted', 'failed')),
  error_message text,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mailing_list_presale_deliveries_subscriber_show_unique unique (subscriber_id, show_id),
  constraint mailing_list_presale_deliveries_provider_key_unique unique (provider_idempotency_key)
);

create unique index if not exists mailing_list_presale_deliveries_resend_id_unique
  on public.mailing_list_presale_deliveries(resend_message_id)
  where resend_message_id is not null;

create index if not exists mailing_list_presale_deliveries_show_created_idx
  on public.mailing_list_presale_deliveries(show_id, created_at desc);

alter table public.mailing_list_presale_deliveries enable row level security;
revoke all on table public.mailing_list_presale_deliveries from public, anon, authenticated;
grant all on table public.mailing_list_presale_deliveries to service_role;

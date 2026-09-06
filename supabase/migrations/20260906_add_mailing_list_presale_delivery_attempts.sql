create table if not exists public.mailing_list_presale_delivery_attempts (
  id uuid primary key,
  presale_delivery_id uuid not null references public.mailing_list_presale_deliveries(id) on delete cascade,
  request_id uuid not null,
  attempt_type text not null check (attempt_type in ('manual_resend')),
  recipient text not null,
  subject text not null,
  ticket_url_snapshot text not null,
  presale_code_snapshot text,
  rendered_text_snapshot text,
  administrative_reason text,
  provider_idempotency_key text not null,
  resend_message_id text,
  send_status text not null default 'pending' check (send_status in ('pending', 'accepted', 'failed')),
  error_message text,
  sent_at timestamptz,
  failed_at timestamptz,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mailing_list_presale_delivery_attempts_request_unique unique (request_id),
  constraint mailing_list_presale_delivery_attempts_provider_key_unique unique (provider_idempotency_key)
);

create unique index if not exists mailing_list_presale_delivery_attempts_resend_id_unique
  on public.mailing_list_presale_delivery_attempts(resend_message_id)
  where resend_message_id is not null;

create index if not exists mailing_list_presale_delivery_attempts_delivery_requested_idx
  on public.mailing_list_presale_delivery_attempts(presale_delivery_id, requested_at desc);

alter table public.mailing_list_presale_delivery_attempts enable row level security;
revoke all on table public.mailing_list_presale_delivery_attempts from public, anon, authenticated;
grant all on table public.mailing_list_presale_delivery_attempts to service_role;

alter table public.mailing_list_presale_delivery_events
  add column if not exists presale_delivery_attempt_id uuid
  references public.mailing_list_presale_delivery_attempts(id) on delete cascade;

create index if not exists mailing_list_presale_delivery_events_attempt_occurred_idx
  on public.mailing_list_presale_delivery_events(presale_delivery_attempt_id, provider_occurred_at asc)
  where presale_delivery_attempt_id is not null;

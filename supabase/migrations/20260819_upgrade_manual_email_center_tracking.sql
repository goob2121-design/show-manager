alter table public.manual_email_history
  add column if not exists recipient_name text,
  add column if not exists reply_to text,
  add column if not exists message_text text,
  add column if not exists sent_at timestamptz,
  add column if not exists current_status text,
  add column if not exists last_activity_at timestamptz,
  add column if not exists request_id uuid,
  add column if not exists updated_at timestamptz not null default now();

update public.manual_email_history
set
  reply_to = coalesce(reply_to, 'info@cumberlandmountainmusic.com'),
  sent_at = case when send_status = 'sent' then coalesce(sent_at, created_at) else sent_at end,
  current_status = coalesce(current_status, case when send_status = 'sent' then 'sent' else 'failed' end),
  last_activity_at = coalesce(last_activity_at, created_at)
where reply_to is null or current_status is null or last_activity_at is null
   or (send_status = 'sent' and sent_at is null);

alter table public.manual_email_history
  drop constraint if exists manual_email_history_send_status_check;

alter table public.manual_email_history
  add constraint manual_email_history_send_status_check
  check (send_status in ('queued', 'sent', 'failed'));

create unique index if not exists manual_email_history_request_id_unique
  on public.manual_email_history(request_id)
  where request_id is not null;

create unique index if not exists manual_email_history_resend_message_id_unique
  on public.manual_email_history(resend_message_id)
  where resend_message_id is not null;

create table if not exists public.manual_email_events (
  id uuid primary key default gen_random_uuid(),
  email_history_id uuid not null references public.manual_email_history(id) on delete cascade,
  resend_message_id text not null,
  event_type text not null check (event_type in (
    'email.sent',
    'email.delivered',
    'email.delivery_delayed',
    'email.complained',
    'email.bounced',
    'email.opened',
    'email.clicked',
    'email.failed'
  )),
  event_created_at timestamptz not null,
  recipient text,
  safe_clicked_url text,
  detail text,
  provider_event_id text,
  event_fingerprint text not null,
  received_at timestamptz not null default now()
);

create unique index if not exists manual_email_events_fingerprint_unique
  on public.manual_email_events(event_fingerprint);

create index if not exists manual_email_events_history_created_at_idx
  on public.manual_email_events(email_history_id, event_created_at asc);

alter table public.manual_email_events enable row level security;
revoke all on table public.manual_email_events from anon, authenticated;

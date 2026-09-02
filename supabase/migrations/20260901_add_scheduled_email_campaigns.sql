create table if not exists public.scheduled_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  template_key text not null,
  audience_key text not null,
  audience_label text not null,
  sender_key text not null,
  from_address text not null,
  reply_to text not null,
  subject_template text not null,
  heading_template text not null default '',
  message_template text not null,
  cta_label_template text not null default '',
  cta_url_template text not null default '',
  campaign_merge_fields jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'processing', 'completed', 'failed', 'cancelled')),
  recipient_count_at_schedule integer not null default 0,
  final_recipient_count integer,
  bulk_operation_id uuid references public.manual_email_bulk_operations(id) on delete set null,
  delivery_trigger text check (delivery_trigger is null or delivery_trigger in ('automatic', 'manual')),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  manually_sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  approved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_email_campaigns_due_idx
  on public.scheduled_email_campaigns(status, scheduled_for)
  where status = 'scheduled';

alter table public.scheduled_email_campaigns enable row level security;
revoke all on table public.scheduled_email_campaigns from public, anon, authenticated;
grant all on table public.scheduled_email_campaigns to service_role;

comment on table public.scheduled_email_campaigns is
  'Immutable Email Center campaign snapshots whose dynamic audiences are resolved again when delivery is claimed.';

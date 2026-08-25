create table if not exists public.scheduled_presale_campaigns (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  template_key text not null check (template_key = 'presale_early_access'),
  audience_key text not null check (audience_key = 'mailing_list_subscribers'),
  audience_label text not null,
  sender_key text not null,
  from_address text not null,
  reply_to text not null,
  subject_template text not null,
  heading_template text not null default '',
  message_template text not null,
  cta_label_template text not null default '',
  cta_url_template text not null default '{{ticket_link}}',
  show_name_snapshot text not null,
  show_date_snapshot text,
  presale_starts_at_snapshot timestamptz not null,
  public_sale_starts_at_snapshot timestamptz,
  ticket_url_snapshot text not null,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'processing', 'completed', 'failed', 'cancelled')),
  recipient_count_at_schedule integer not null default 0,
  final_recipient_count integer,
  bulk_operation_id uuid references public.manual_email_bulk_operations(id) on delete set null,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_presale_campaigns_show_unique unique (show_id)
);

create index if not exists scheduled_presale_campaigns_due_idx
  on public.scheduled_presale_campaigns(status, scheduled_for)
  where status = 'scheduled';

alter table public.scheduled_presale_campaigns enable row level security;
revoke all on table public.scheduled_presale_campaigns from public, anon, authenticated;
grant all on table public.scheduled_presale_campaigns to service_role;

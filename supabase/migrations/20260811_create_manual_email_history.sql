create table if not exists public.manual_email_history (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  recipient_email text not null,
  from_address text not null,
  subject text not null,
  template_key text not null check (template_key in (
    'general',
    'complimentary_tickets',
    'reserved_seating',
    'sponsor_message',
    'show_information',
    'custom'
  )),
  send_status text not null check (send_status in ('sent', 'failed')),
  resend_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists manual_email_history_show_created_at_idx
  on public.manual_email_history(show_id, created_at desc);

alter table public.manual_email_history enable row level security;

revoke all on table public.manual_email_history from anon, authenticated;

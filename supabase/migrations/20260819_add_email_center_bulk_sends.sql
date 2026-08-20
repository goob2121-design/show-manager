create table if not exists public.manual_email_bulk_operations (
  id uuid primary key,
  show_id uuid not null references public.shows(id) on delete cascade,
  audience_key text not null,
  audience_label text not null,
  template_key text not null,
  sender_key text not null,
  from_address text not null,
  subject_template text not null,
  requested_recipient_count integer not null default 0,
  selected_recipient_count integer not null default 0,
  skipped_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  operation_status text not null check (operation_status in ('pending', 'sending', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.manual_email_history
  add column if not exists bulk_operation_id uuid references public.manual_email_bulk_operations(id) on delete set null,
  add column if not exists original_delivery_id uuid references public.manual_email_history(id) on delete set null;

create index if not exists manual_email_bulk_operations_show_created_at_idx
  on public.manual_email_bulk_operations(show_id, created_at desc);

create index if not exists manual_email_history_bulk_operation_id_idx
  on public.manual_email_history(bulk_operation_id)
  where bulk_operation_id is not null;

alter table public.manual_email_bulk_operations enable row level security;
revoke all on table public.manual_email_bulk_operations from anon, authenticated;

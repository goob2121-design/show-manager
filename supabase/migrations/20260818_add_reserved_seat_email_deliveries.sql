create table if not exists public.reserved_seat_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references public.shows(id) on delete cascade,
  reserved_seating_link_id uuid references public.show_reserved_seating_links(id) on delete set null,
  email_type text not null check (email_type in ('reserved_seat_initial', 'reserved_seat_reminder')),
  sequence_number integer not null check (sequence_number >= 0),
  recipient text not null,
  subject text not null,
  resend_email_id text,
  provider_idempotency_key text not null,
  request_id text not null,
  requested_source text not null check (requested_source in ('square_import', 'admin_single', 'admin_bulk')),
  bulk_operation_id uuid,
  send_status text not null check (send_status in ('pending', 'accepted', 'failed')),
  sent_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create unique index if not exists reserved_seat_email_deliveries_resend_email_id_unique on public.reserved_seat_email_deliveries(resend_email_id) where resend_email_id is not null;
create unique index if not exists reserved_seat_email_deliveries_request_id_unique on public.reserved_seat_email_deliveries(request_id);
create unique index if not exists reserved_seat_email_deliveries_provider_idempotency_key_unique on public.reserved_seat_email_deliveries(provider_idempotency_key);
create unique index if not exists reserved_seat_email_deliveries_link_type_sequence_unique on public.reserved_seat_email_deliveries(reserved_seating_link_id, email_type, sequence_number) where reserved_seating_link_id is not null;
create index if not exists reserved_seat_email_deliveries_link_created_at_idx on public.reserved_seat_email_deliveries(reserved_seating_link_id, created_at);
create index if not exists reserved_seat_email_deliveries_show_created_at_idx on public.reserved_seat_email_deliveries(show_id, created_at);

alter table public.reserved_seat_email_deliveries enable row level security;
revoke all on table public.reserved_seat_email_deliveries from public, anon, authenticated;
grant all on table public.reserved_seat_email_deliveries to service_role;

alter table public.reserved_seat_email_events add column if not exists email_delivery_id uuid references public.reserved_seat_email_deliveries(id) on delete set null;
create index if not exists reserved_seat_email_events_email_delivery_id_idx on public.reserved_seat_email_events(email_delivery_id);

insert into public.reserved_seat_email_deliveries (show_id, reserved_seating_link_id, email_type, sequence_number, recipient, subject, resend_email_id, provider_idempotency_key, request_id, requested_source, send_status, sent_at, created_at)
select link.show_id, link.id, 'reserved_seat_initial', 0,
  coalesce(nullif(trim(link.email), ''), 'unknown@invalid.local'),
  'Select Your Reserved Seats - The Cumberland Mountain Music Show',
  link.resend_email_id, 'legacy-initial-' || link.id::text, 'legacy-initial-' || link.id::text,
  'square_import', 'accepted', link.sent_at, coalesce(link.sent_at, link.created_at)
from public.show_reserved_seating_links link
where link.resend_email_id is not null and link.resend_email_id not like 'sending:%' and link.resend_email_id not like 'sent:%'
on conflict do nothing;

update public.reserved_seat_email_events event
set email_delivery_id = delivery.id
from public.reserved_seat_email_deliveries delivery
where event.email_delivery_id is null and delivery.resend_email_id = event.resend_email_id;

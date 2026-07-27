create table if not exists public.reserved_seat_email_events (
  id uuid primary key default gen_random_uuid(),
  resend_email_id text not null,
  reserved_seating_link_id uuid references public.show_reserved_seating_links(id) on delete set null,
  event_type text not null,
  event_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  recipient text,
  click_target text,
  raw_event_id text
);

create unique index if not exists reserved_seat_email_events_raw_event_id_unique
  on public.reserved_seat_email_events(raw_event_id)
  where raw_event_id is not null;

create unique index if not exists reserved_seat_email_events_natural_key_unique
  on public.reserved_seat_email_events(
    resend_email_id,
    event_type,
    event_created_at,
    coalesce(click_target, '')
  );

create index if not exists reserved_seat_email_events_resend_email_id_idx
  on public.reserved_seat_email_events(resend_email_id);

create index if not exists reserved_seat_email_events_reserved_seating_link_id_idx
  on public.reserved_seat_email_events(reserved_seating_link_id);

create index if not exists reserved_seat_email_events_event_created_at_idx
  on public.reserved_seat_email_events(event_created_at desc);

alter table public.reserved_seat_email_events enable row level security;

revoke all on table public.reserved_seat_email_events from public;
revoke all on table public.reserved_seat_email_events from anon;
revoke all on table public.reserved_seat_email_events from authenticated;

grant all on table public.reserved_seat_email_events to service_role;

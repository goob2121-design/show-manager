alter table public.show_reserved_seating_links
  add column if not exists ticket_emailed_at timestamptz;

comment on column public.show_reserved_seating_links.ticket_emailed_at is
  'Timestamp recorded after the official reserved-seat ticket email provider accepts the message.';

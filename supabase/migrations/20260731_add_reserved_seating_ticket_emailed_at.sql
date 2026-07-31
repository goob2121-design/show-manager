alter table public.show_reserved_seating_links
  add column if not exists ticket_emailed_at timestamptz;

alter table public.show_reserved_seating_links
  add column if not exists resend_email_id text,
  add column if not exists last_email_error text,
  add column if not exists email_attempt_count integer not null default 0,
  add column if not exists last_email_attempt_at timestamptz;

alter table public.show_reserved_seating_links
  drop constraint if exists show_reserved_seating_links_email_attempt_count_check;

alter table public.show_reserved_seating_links
  add constraint show_reserved_seating_links_email_attempt_count_check
  check (email_attempt_count >= 0);

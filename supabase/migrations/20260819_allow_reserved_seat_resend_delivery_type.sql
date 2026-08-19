alter table public.reserved_seat_email_deliveries
  drop constraint if exists reserved_seat_email_deliveries_email_type_check;

alter table public.reserved_seat_email_deliveries
  add constraint reserved_seat_email_deliveries_email_type_check
  check (email_type in ('reserved_seat_initial', 'reserved_seat_resend', 'reserved_seat_reminder'));

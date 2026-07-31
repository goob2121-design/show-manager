alter table public.show_reserved_seating_links
  add column if not exists seat_preference text not null default 'customer_select';

alter table public.show_reserved_seating_links
  drop constraint if exists show_reserved_seating_links_seat_preference_check;

alter table public.show_reserved_seating_links
  add constraint show_reserved_seating_links_seat_preference_check
  check (seat_preference in ('customer_select', 'auto_assign'));

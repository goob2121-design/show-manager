alter table public.show_reserved_seating_links
  add column if not exists is_complimentary boolean not null default false,
  add column if not exists source_note text;

alter table public.show_reserved_seating_links drop constraint if exists show_reserved_seating_links_selection_mode_check;

alter table public.show_reserved_seating_links
  add constraint show_reserved_seating_links_selection_mode_check
  check (selection_mode in ('customer', 'manual', 'imported', 'comp'));

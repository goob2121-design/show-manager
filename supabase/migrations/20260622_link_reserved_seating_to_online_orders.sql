alter table public.show_reserved_seating_links
  add column if not exists source_ticket_id uuid references public.show_comp_tickets(id) on delete set null,
  add column if not exists source_order_id text,
  add column if not exists source_import_key text;

create index if not exists show_reserved_seating_links_show_id_source_ticket_id_idx
  on public.show_reserved_seating_links(show_id, source_ticket_id);

create index if not exists show_reserved_seating_links_show_id_source_order_id_idx
  on public.show_reserved_seating_links(show_id, source_order_id)
  where source_order_id is not null;

create index if not exists show_reserved_seating_links_show_id_source_import_key_idx
  on public.show_reserved_seating_links(show_id, source_import_key)
  where source_import_key is not null;

alter table public.show_reserved_seating_links drop constraint if exists show_reserved_seating_links_selection_mode_check;

alter table public.show_reserved_seating_links
  add constraint show_reserved_seating_links_selection_mode_check
  check (selection_mode in ('customer', 'manual', 'imported'));

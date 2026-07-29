alter table public.show_reserved_seating_links
  add column if not exists scan_token text;

create unique index if not exists show_reserved_seating_links_scan_token_unique
  on public.show_reserved_seating_links(scan_token)
  where scan_token is not null;

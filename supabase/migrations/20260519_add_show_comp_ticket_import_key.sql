alter table public.show_comp_tickets
  add column if not exists import_key text;

alter table public.show_checklist_items
  add column if not exists due_date date;

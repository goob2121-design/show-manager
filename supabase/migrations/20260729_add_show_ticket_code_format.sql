alter table public.shows
  add column if not exists ticket_code_format text;

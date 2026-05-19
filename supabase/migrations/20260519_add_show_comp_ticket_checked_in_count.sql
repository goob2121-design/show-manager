alter table public.show_comp_tickets
  add column if not exists checked_in_count integer not null default 0;

update public.show_comp_tickets
set checked_in_count = case
  when checked_in then greatest(coalesce(ticket_count, 1), 0)
  else 0
end
where checked_in_count = 0 and checked_in is not null;

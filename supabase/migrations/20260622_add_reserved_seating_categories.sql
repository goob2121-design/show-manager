alter table public.show_reserved_seating_links
  add column if not exists seat_category text not null default 'paid_reserved';

alter table public.show_reserved_seat_assignments
  add column if not exists seat_category text;

update public.show_reserved_seating_links
set seat_category = case
  when is_complimentary then 'comp'
  else 'paid_reserved'
end
where seat_category is null
   or btrim(seat_category) = '';

update public.show_reserved_seat_assignments as assignments
set seat_category = case
  when assignments.assignment_type = 'blocked' then null
  when links.seat_category is not null and btrim(links.seat_category) <> '' then links.seat_category
  else 'paid_reserved'
end
from public.show_reserved_seating_links as links
where assignments.seating_link_id = links.id
  and (assignments.seat_category is null or btrim(assignments.seat_category) = '');

update public.show_reserved_seat_assignments
set seat_category = 'paid_reserved'
where assignment_type = 'customer'
  and (seat_category is null or btrim(seat_category) = '');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'show_reserved_seating_links_seat_category_check'
  ) then
    alter table public.show_reserved_seating_links
      add constraint show_reserved_seating_links_seat_category_check
      check (seat_category in ('paid_reserved', 'comp', 'guest'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'show_reserved_seat_assignments_seat_category_check'
  ) then
    alter table public.show_reserved_seat_assignments
      add constraint show_reserved_seat_assignments_seat_category_check
      check (seat_category is null or seat_category in ('paid_reserved', 'comp', 'guest'));
  end if;
end
$$;

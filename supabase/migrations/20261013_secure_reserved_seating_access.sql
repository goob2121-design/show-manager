begin;

drop policy if exists "Allow public read reserved seating links" on public.show_reserved_seating_links;
drop policy if exists "Allow public insert reserved seating links" on public.show_reserved_seating_links;
drop policy if exists "Allow public update reserved seating links" on public.show_reserved_seating_links;
drop policy if exists "Allow public delete reserved seating links" on public.show_reserved_seating_links;
drop policy if exists "Allow public read reserved seat assignments" on public.show_reserved_seat_assignments;
drop policy if exists "Allow public insert reserved seat assignments" on public.show_reserved_seat_assignments;
drop policy if exists "Allow public update reserved seat assignments" on public.show_reserved_seat_assignments;
drop policy if exists "Allow public delete reserved seat assignments" on public.show_reserved_seat_assignments;

revoke all on table public.show_reserved_seating_links from anon, authenticated;
revoke all on table public.show_reserved_seat_assignments from anon, authenticated;

commit;

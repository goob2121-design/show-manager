alter table public.show_reserved_seating_links
  add column if not exists sent_at timestamptz,
  add column if not exists selection_mode text not null default 'customer';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'show_reserved_seating_links_selection_mode_check'
  ) then
    alter table public.show_reserved_seating_links
      add constraint show_reserved_seating_links_selection_mode_check
      check (selection_mode in ('customer', 'manual'));
  end if;
end
$$;

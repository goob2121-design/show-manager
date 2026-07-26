do $$
declare
  duplicate_group_count bigint;
  duplicate_diagnostics text;
begin
  select count(*)
    into duplicate_group_count
  from (
    select show_id, source_ticket_id
    from public.show_reserved_seating_links
    where source_ticket_id is not null
    group by show_id, source_ticket_id
    having count(*) > 1
  ) duplicate_groups;

  if duplicate_group_count > 0 then
    select string_agg(
      format(
        'show=%s ticket=%s rows=%s',
        left(show_id::text, 4) || '...' || right(show_id::text, 4),
        left(source_ticket_id::text, 4) || '...' || right(source_ticket_id::text, 4),
        row_count
      ),
      ', '
      order by show_id, source_ticket_id
    )
      into duplicate_diagnostics
    from (
      select show_id, source_ticket_id, count(*) as row_count
      from public.show_reserved_seating_links
      where source_ticket_id is not null
      group by show_id, source_ticket_id
      having count(*) > 1
      order by show_id, source_ticket_id
      limit 10
    ) duplicate_groups;

    raise exception
      'Cannot add reserved-link ownership uniqueness: % duplicate ownership group(s) remain. Diagnostics: %',
      duplicate_group_count,
      duplicate_diagnostics;
  end if;
end
$$;

create unique index show_reserved_seating_links_show_id_source_ticket_id_unique
  on public.show_reserved_seating_links(show_id, source_ticket_id)
  where source_ticket_id is not null;
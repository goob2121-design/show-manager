begin;

alter table public.show_reserved_seating_links
  add column child_seat_limit_admin_override boolean not null default false;

-- Historical low limits have no audit trail. Preserve them rather than guessing.
update public.show_reserved_seating_links
set child_seat_limit_admin_override = true
where child_seat_limit < 3;

create or replace function public.guard_reserved_child_allowance_override()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.child_seat_limit_admin_override is distinct from old.child_seat_limit_admin_override
    and not coalesce(public.stageflow_child_mutation_allowed(), false) then
    raise exception 'Child-seat overrides must be changed through the guarded API.';
  end if;
  return new;
end
$$;

create trigger guard_reserved_child_allowance_override
before update on public.show_reserved_seating_links
for each row execute function public.guard_reserved_child_allowance_override();

create function public.initialize_reserved_child_seat_allowance(
  p_show_id uuid,
  p_reservation_id uuid
)
returns table (result_status text, child_seat_limit integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.show_reserved_seating_links%rowtype;
  v_previous_guard text := current_setting('stageflow.child_mutation', true);
begin
  select * into v_link from public.show_reserved_seating_links
  where id = p_reservation_id and show_id = p_show_id for update;
  if not found then return query select 'NOT_FOUND', 0; return; end if;

  if coalesce(v_link.is_complimentary, false) or v_link.seat_category <> 'paid_reserved'
    or not exists (
      select 1 from public.show_comp_tickets ticket
      where ticket.show_id = v_link.show_id and ticket.ticket_type = 'paid_online'
        and (
          ticket.id = v_link.source_ticket_id
          or (v_link.source_ticket_id is null and exists (
            select 1 from public.show_admission_projection_sources projection
            where projection.show_id = v_link.show_id
              and projection.source_type = 'reserved_link'
              and projection.source_id = v_link.id
              and projection.projected_ticket_id = ticket.id
          ))
        )
    ) then
    return query select 'NOT_ELIGIBLE', v_link.child_seat_limit; return;
  end if;

  if v_link.child_seat_limit_admin_override or v_link.child_seat_limit >= 3 then
    return query select 'PRESERVED', v_link.child_seat_limit; return;
  end if;

  perform set_config('stageflow.child_mutation', 'allowed', true);
  update public.show_reserved_seating_links set child_seat_limit = 3 where id = v_link.id;
  perform set_config('stageflow.child_mutation', coalesce(v_previous_guard, ''), true);
  return query select 'INITIALIZED', 3;
end
$$;

-- Record explicit admin decisions, including saving the same limit again.
create or replace function public.set_reserved_child_seat_limit(
  p_show_id uuid,
  p_reservation_id uuid,
  p_child_seat_limit integer
)
returns table (result_status text, child_seat_limit integer, child_seat_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.show_reserved_seating_links%rowtype;
  v_ticket public.show_comp_tickets%rowtype;
  v_child_count integer;
  v_previous_guard text := current_setting('stageflow.child_mutation', true);
begin
  select * into v_link from public.show_reserved_seating_links
  where id = p_reservation_id and show_id = p_show_id for update;
  if not found then return query select 'NOT_FOUND', 0, 0; return; end if;
  if coalesce(v_link.is_complimentary, false) or v_link.seat_category <> 'paid_reserved' then
    return query select 'NOT_ELIGIBLE', v_link.child_seat_limit, 0; return;
  end if;
  if v_link.source_ticket_id is not null then
    select * into v_ticket from public.show_comp_tickets
    where id = v_link.source_ticket_id and show_id = v_link.show_id;
  else
    select ticket.* into v_ticket
    from public.show_admission_projection_sources projection
    join public.show_comp_tickets ticket on ticket.id = projection.projected_ticket_id
    where projection.show_id = v_link.show_id
      and projection.source_type = 'reserved_link'
      and projection.source_id = v_link.id;
  end if;
  if v_ticket.id is null or v_ticket.ticket_type <> 'paid_online' then
    return query select 'NOT_ELIGIBLE', v_link.child_seat_limit, 0; return;
  end if;
  if p_child_seat_limit is null or p_child_seat_limit < 0 then
    raise exception 'Child-seat limit must be a nonnegative integer.';
  end if;

  select count(*) into v_child_count from public.show_reserved_seat_assignments
  where seating_link_id = v_link.id and occupant_type = 'child_free';
  if p_child_seat_limit < v_child_count or p_child_seat_limit < v_link.child_checked_in_count then
    return query select 'BELOW_CURRENT_USAGE', v_link.child_seat_limit, v_child_count; return;
  end if;

  perform set_config('stageflow.child_mutation', 'allowed', true);
  update public.show_reserved_seating_links
  set child_seat_limit = p_child_seat_limit, child_seat_limit_admin_override = true
  where id = v_link.id;
  perform set_config('stageflow.child_mutation', coalesce(v_previous_guard, ''), true);
  return query select 'UPDATED', p_child_seat_limit, v_child_count;
end
$$;

revoke all on function public.initialize_reserved_child_seat_allowance(uuid, uuid) from public, anon, authenticated;
grant execute on function public.initialize_reserved_child_seat_allowance(uuid, uuid) to service_role;
revoke all on function public.set_reserved_child_seat_limit(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.set_reserved_child_seat_limit(uuid, uuid, integer) to service_role;
revoke all on function public.guard_reserved_child_allowance_override() from public, anon, authenticated;

commit;

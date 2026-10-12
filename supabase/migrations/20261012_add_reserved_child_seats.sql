begin;

alter table public.show_reserved_seating_links
  add column if not exists child_seat_limit integer not null default 0,
  add column if not exists child_checked_in_count integer not null default 0;

alter table public.show_reserved_seat_assignments
  add column if not exists occupant_type text not null default 'ticketed';

with eligible_paid_online_links as (
  select link.id
  from public.show_reserved_seating_links link
  join public.show_comp_tickets ticket
    on ticket.id = link.source_ticket_id
   and ticket.show_id = link.show_id
   and ticket.ticket_type = 'paid_online'
  where not coalesce(link.is_complimentary, false)
    and link.seat_category = 'paid_reserved'
  union
  select link.id
  from public.show_reserved_seating_links link
  join public.show_admission_projection_sources projection
    on projection.show_id = link.show_id
   and projection.source_type = 'reserved_link'
   and projection.source_id = link.id
  join public.show_comp_tickets ticket
    on ticket.id = projection.projected_ticket_id
   and ticket.show_id = link.show_id
   and ticket.ticket_type = 'paid_online'
  where link.source_ticket_id is null
    and not coalesce(link.is_complimentary, false)
    and link.seat_category = 'paid_reserved'
)
update public.show_reserved_seating_links link
set child_seat_limit = 3
from eligible_paid_online_links eligible
where link.id = eligible.id
  and link.child_seat_limit < 3;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'show_reserved_seating_links_child_counts_check'
      and conrelid = 'public.show_reserved_seating_links'::regclass
  ) then
    alter table public.show_reserved_seating_links
      add constraint show_reserved_seating_links_child_counts_check
      check (child_seat_limit >= 0 and child_checked_in_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'show_reserved_seat_assignments_occupant_type_check'
      and conrelid = 'public.show_reserved_seat_assignments'::regclass
  ) then
    alter table public.show_reserved_seat_assignments
      add constraint show_reserved_seat_assignments_occupant_type_check
      check (occupant_type in ('ticketed', 'child_free'));
  end if;
end
$$;

create index if not exists show_reserved_seat_assignments_link_occupant_idx
  on public.show_reserved_seat_assignments(seating_link_id, occupant_type);

create or replace function public.stageflow_child_mutation_allowed()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select current_setting('stageflow.child_mutation', true) = 'allowed'
$$;

create or replace function public.guard_reserved_child_mutations()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.stageflow_child_mutation_allowed() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'show_reserved_seating_links' then
    if tg_op = 'DELETE' and exists (
      select 1 from public.show_reserved_seat_assignments
      where seating_link_id = old.id and occupant_type = 'child_free'
    ) then
      raise exception 'Child-seat reservations must be changed through the guarded API.';
    end if;

    if tg_op = 'UPDATE' and (
      new.child_seat_limit is distinct from old.child_seat_limit
      or new.child_checked_in_count is distinct from old.child_checked_in_count
    ) then
      raise exception 'Child-seat counts must be changed through the guarded API.';
    end if;
  elsif tg_table_name = 'show_reserved_seat_assignments' then
    if (tg_op = 'INSERT' and new.occupant_type = 'child_free')
      or (tg_op = 'UPDATE' and (new.occupant_type = 'child_free' or old.occupant_type = 'child_free'))
      or (tg_op = 'DELETE' and old.occupant_type = 'child_free') then
      raise exception 'Child-seat assignments must be changed through the guarded API.';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

drop trigger if exists guard_reserved_child_link_mutations on public.show_reserved_seating_links;
create trigger guard_reserved_child_link_mutations
before update or delete on public.show_reserved_seating_links
for each row execute function public.guard_reserved_child_mutations();

drop trigger if exists guard_reserved_child_assignment_mutations on public.show_reserved_seat_assignments;
create trigger guard_reserved_child_assignment_mutations
before insert or update or delete on public.show_reserved_seat_assignments
for each row execute function public.guard_reserved_child_mutations();

create or replace function public.replace_reserved_family_seats(
  p_selection_token text,
  p_paid_seat_ids text[],
  p_child_seat_ids text[]
)
returns table (
  result_status text,
  reservation_id uuid,
  paid_seat_count integer,
  child_seat_count integer,
  total_seat_count integer,
  child_seat_limit integer,
  scan_token text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.show_reserved_seating_links%rowtype;
  v_ticket public.show_comp_tickets%rowtype;
  v_paid_ids text[] := coalesce(p_paid_seat_ids, array[]::text[]);
  v_child_ids text[] := coalesce(p_child_seat_ids, array[]::text[]);
  v_existing_paid_count integer;
  v_existing_child_count integer;
  v_distinct_count integer;
  v_seat_id text;
begin
  select * into v_link
  from public.show_reserved_seating_links
  where selection_token = btrim(p_selection_token)
  for update;

  if not found then
    return query select 'NOT_FOUND', null::uuid, 0, 0, 0, 0, null::text;
    return;
  end if;

  if coalesce(v_link.is_complimentary, false) or v_link.seat_category <> 'paid_reserved' then
    return query select 'NOT_ELIGIBLE', v_link.id, 0, 0, 0, v_link.child_seat_limit, v_link.scan_token;
    return;
  end if;

  if v_link.source_ticket_id is not null then
    select * into v_ticket from public.show_comp_tickets
    where id = v_link.source_ticket_id and show_id = v_link.show_id
    for update;
  else
    select ticket.* into v_ticket
    from public.show_admission_projection_sources projection
    join public.show_comp_tickets ticket on ticket.id = projection.projected_ticket_id
    where projection.show_id = v_link.show_id
      and projection.source_type = 'reserved_link'
      and projection.source_id = v_link.id
    for update of ticket;
  end if;

  if v_ticket.id is null or v_ticket.ticket_type <> 'paid_online' then
    return query select 'NOT_ELIGIBLE', v_link.id, 0, 0, 0, v_link.child_seat_limit, v_link.scan_token;
    return;
  end if;

  select count(*) filter (where occupant_type = 'ticketed'),
         count(*) filter (where occupant_type = 'child_free')
    into v_existing_paid_count, v_existing_child_count
  from public.show_reserved_seat_assignments
  where seating_link_id = v_link.id and assignment_type = 'customer';

  if cardinality(v_paid_ids) <> v_existing_paid_count then
    return query select 'PAID_SEAT_COUNT_CHANGED', v_link.id, v_existing_paid_count, v_existing_child_count,
      v_existing_paid_count + v_existing_child_count, v_link.child_seat_limit, v_link.scan_token;
    return;
  end if;

  if cardinality(v_child_ids) < v_existing_child_count then
    return query select 'CHILD_SEAT_REMOVAL_NOT_ALLOWED', v_link.id, v_existing_paid_count, v_existing_child_count,
      v_existing_paid_count + v_existing_child_count, v_link.child_seat_limit, v_link.scan_token;
    return;
  end if;

  if cardinality(v_child_ids) > v_link.child_seat_limit then
    return query select 'CHILD_LIMIT_EXCEEDED', v_link.id, v_existing_paid_count, v_existing_child_count,
      v_existing_paid_count + v_existing_child_count, v_link.child_seat_limit, v_link.scan_token;
    return;
  end if;

  select count(distinct value) into v_distinct_count
  from unnest(v_paid_ids || v_child_ids) as requested(value);
  if v_distinct_count <> cardinality(v_paid_ids) + cardinality(v_child_ids) then
    return query select 'DUPLICATE_SEAT', v_link.id, v_existing_paid_count, v_existing_child_count,
      v_existing_paid_count + v_existing_child_count, v_link.child_seat_limit, v_link.scan_token;
    return;
  end if;

  if exists (
    select 1 from unnest(v_paid_ids || v_child_ids) requested(value)
    where requested.value !~ '^[LR]-[A-J](10|[1-9])$'
  ) then
    return query select 'INVALID_SEAT', v_link.id, v_existing_paid_count, v_existing_child_count,
      v_existing_paid_count + v_existing_child_count, v_link.child_seat_limit, v_link.scan_token;
    return;
  end if;

  if exists (
    select 1 from public.show_reserved_seat_assignments assignment
    where assignment.show_id = v_link.show_id
      and assignment.seat_id = any(v_paid_ids || v_child_ids)
      and assignment.seating_link_id is distinct from v_link.id
  ) then
    return query select 'SEAT_CONFLICT', v_link.id, v_existing_paid_count, v_existing_child_count,
      v_existing_paid_count + v_existing_child_count, v_link.child_seat_limit, v_link.scan_token;
    return;
  end if;

  if coalesce(v_ticket.checked_in_count, 0) > 0 or v_link.child_checked_in_count > 0 then
    return query select 'ALREADY_CHECKED_IN', v_link.id, v_existing_paid_count, v_existing_child_count,
      v_existing_paid_count + v_existing_child_count, v_link.child_seat_limit, v_link.scan_token;
    return;
  end if;

  perform set_config('stageflow.child_mutation', 'allowed', true);
  delete from public.show_reserved_seat_assignments where seating_link_id = v_link.id;

  foreach v_seat_id in array v_paid_ids loop
    insert into public.show_reserved_seat_assignments (
      show_id, seating_link_id, customer_name, email, seat_id, section, row_label,
      seat_number, assignment_type, seat_category, occupant_type
    ) values (
      v_link.show_id, v_link.id, v_link.customer_name, v_link.email, v_seat_id,
      split_part(v_seat_id, '-', 1), substring(split_part(v_seat_id, '-', 2) from 1 for 1),
      substring(split_part(v_seat_id, '-', 2) from 2)::integer,
      'customer', 'paid_reserved', 'ticketed'
    );
  end loop;

  foreach v_seat_id in array v_child_ids loop
    insert into public.show_reserved_seat_assignments (
      show_id, seating_link_id, customer_name, email, seat_id, section, row_label,
      seat_number, assignment_type, seat_category, occupant_type, notes
    ) values (
      v_link.show_id, v_link.id, v_link.customer_name, v_link.email, v_seat_id,
      split_part(v_seat_id, '-', 1), substring(split_part(v_seat_id, '-', 2) from 1 for 1),
      substring(split_part(v_seat_id, '-', 2) from 2)::integer,
      'customer', 'paid_reserved', 'child_free', '[Admission Type: free child 10 and under]'
    );
  end loop;

  return query select 'UPDATED', v_link.id, cardinality(v_paid_ids), cardinality(v_child_ids),
    cardinality(v_paid_ids) + cardinality(v_child_ids), v_link.child_seat_limit, v_link.scan_token;
exception when unique_violation then
  return query select 'SEAT_CONFLICT', v_link.id, v_existing_paid_count, v_existing_child_count,
    v_existing_paid_count + v_existing_child_count, v_link.child_seat_limit, v_link.scan_token;
end
$$;

create or replace function public.set_reserved_child_seat_limit(
  p_show_id uuid,
  p_reservation_id uuid,
  p_child_seat_limit integer
)
returns table (result_status text, child_seat_limit integer, child_seat_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.show_reserved_seating_links%rowtype;
  v_ticket public.show_comp_tickets%rowtype;
  v_child_count integer;
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

  select count(*) into v_child_count from public.show_reserved_seat_assignments
  where seating_link_id = v_link.id and occupant_type = 'child_free';
  if p_child_seat_limit < v_child_count or p_child_seat_limit < v_link.child_checked_in_count then
    return query select 'BELOW_CURRENT_USAGE', v_link.child_seat_limit, v_child_count; return;
  end if;

  perform set_config('stageflow.child_mutation', 'allowed', true);
  update public.show_reserved_seating_links set child_seat_limit = p_child_seat_limit where id = v_link.id;
  return query select 'UPDATED', p_child_seat_limit, v_child_count;
end
$$;

create or replace function public.adjust_reserved_family_check_in(
  p_show_id uuid,
  p_reservation_id uuid,
  p_adult_delta integer,
  p_child_delta integer
)
returns table (
  result_status text,
  ticket_id uuid,
  adult_checked_in integer,
  adult_total integer,
  child_checked_in integer,
  child_total integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.show_reserved_seating_links%rowtype;
  v_ticket public.show_comp_tickets%rowtype;
  v_child_total integer;
  v_next_adult integer;
  v_next_child integer;
begin
  select * into v_link from public.show_reserved_seating_links
  where id = p_reservation_id and show_id = p_show_id for update;
  if not found then return query select 'NOT_FOUND', null::uuid, 0, 0, 0, 0; return; end if;

  if v_link.source_ticket_id is not null then
    select * into v_ticket from public.show_comp_tickets
    where id = v_link.source_ticket_id and show_id = p_show_id for update;
  else
    select ticket.* into v_ticket
    from public.show_admission_projection_sources projection
    join public.show_comp_tickets ticket on ticket.id = projection.projected_ticket_id
    where projection.show_id = p_show_id and projection.source_type = 'reserved_link'
      and projection.source_id = v_link.id for update of ticket;
  end if;
  if v_ticket.id is null then return query select 'TICKET_NOT_FOUND', null::uuid, 0, 0, 0, 0; return; end if;

  select count(*) into v_child_total from public.show_reserved_seat_assignments
  where seating_link_id = v_link.id and occupant_type = 'child_free' and assignment_type = 'customer';
  v_next_adult := v_ticket.checked_in_count + p_adult_delta;
  v_next_child := v_link.child_checked_in_count + p_child_delta;
  if v_next_adult < 0 or v_next_adult > v_ticket.ticket_count
    or v_next_child < 0 or v_next_child > v_child_total then
    return query select 'OUT_OF_RANGE', v_ticket.id, v_ticket.checked_in_count, v_ticket.ticket_count,
      v_link.child_checked_in_count, v_child_total; return;
  end if;

  update public.show_comp_tickets set
    checked_in_count = v_next_adult,
    checked_in = v_next_adult >= ticket_count
  where id = v_ticket.id;
  perform set_config('stageflow.child_mutation', 'allowed', true);
  update public.show_reserved_seating_links set child_checked_in_count = v_next_child where id = v_link.id;

  return query select 'UPDATED', v_ticket.id, v_next_adult, v_ticket.ticket_count, v_next_child, v_child_total;
end
$$;

create or replace function public.admin_reset_reserved_family_seats(p_show_id uuid, p_reservation_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.show_reserved_seating_links%rowtype;
begin
  select * into v_link from public.show_reserved_seating_links
  where id = p_reservation_id and show_id = p_show_id for update;
  if not found then return 'NOT_FOUND'; end if;
  perform set_config('stageflow.child_mutation', 'allowed', true);
  delete from public.show_reserved_seat_assignments where seating_link_id = v_link.id;
  update public.show_reserved_seating_links
  set submitted_at = null,
      child_checked_in_count = 0,
      selection_mode = case
        when is_complimentary then 'comp'
        when source_ticket_id is not null then 'imported'
        else 'customer'
      end
  where id = v_link.id;
  return 'RESET';
end
$$;

create or replace function public.admin_delete_reserved_family_link(p_show_id uuid, p_reservation_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.show_reserved_seating_links where id = p_reservation_id and show_id = p_show_id for update) then
    return 'NOT_FOUND';
  end if;
  perform set_config('stageflow.child_mutation', 'allowed', true);
  delete from public.show_reserved_seat_assignments where seating_link_id = p_reservation_id;
  delete from public.show_reserved_seating_links where id = p_reservation_id and show_id = p_show_id;
  return 'DELETED';
end
$$;

revoke all on function public.replace_reserved_family_seats(text, text[], text[]) from public, anon, authenticated;
revoke all on function public.set_reserved_child_seat_limit(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.adjust_reserved_family_check_in(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_reset_reserved_family_seats(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_reserved_family_link(uuid, uuid) from public, anon, authenticated;
grant execute on function public.replace_reserved_family_seats(text, text[], text[]) to service_role;
grant execute on function public.set_reserved_child_seat_limit(uuid, uuid, integer) to service_role;
grant execute on function public.adjust_reserved_family_check_in(uuid, uuid, integer, integer) to service_role;
grant execute on function public.admin_reset_reserved_family_seats(uuid, uuid) to service_role;
grant execute on function public.admin_delete_reserved_family_link(uuid, uuid) to service_role;

commit;

begin;

-- Initial confirmation only. Both customer submission paths lock the reservation.
create function public.confirm_reserved_family_seats(
  p_selection_token text,
  p_paid_seat_ids text[],
  p_child_seat_ids text[]
)
returns table (result_status text, reservation_id uuid, paid_seat_count integer,
  child_seat_count integer, total_seat_count integer, submitted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.show_reserved_seating_links%rowtype;
  v_ticket public.show_comp_tickets%rowtype;
  v_paid text[] := coalesce(p_paid_seat_ids, array[]::text[]);
  v_child text[] := coalesce(p_child_seat_ids, array[]::text[]);
  v_saved_paid text[];
  v_saved_child text[];
  v_status text;
  v_previous_guard text := current_setting('stageflow.child_mutation', true);
  v_confirmed_at timestamptz;
begin
  select * into v_link from public.show_reserved_seating_links
  where selection_token = btrim(p_selection_token) for update;
  if not found then
    return query select 'NOT_FOUND', null::uuid, 0, 0, 0, null::timestamptz;
    return;
  end if;

  if coalesce(v_link.is_complimentary, false)
    or v_link.seat_category is distinct from 'paid_reserved' then
    v_status := 'NOT_ELIGIBLE';
  else
    if v_link.source_ticket_id is not null then
      select * into v_ticket from public.show_comp_tickets
      where id = v_link.source_ticket_id and show_id = v_link.show_id for update;
    else
      select ticket.* into v_ticket
      from public.show_admission_projection_sources projection
      join public.show_comp_tickets ticket on ticket.id = projection.projected_ticket_id
        and ticket.show_id = v_link.show_id
      where projection.show_id = v_link.show_id and projection.source_type = 'reserved_link'
        and projection.source_id = v_link.id for update of ticket;
    end if;
    if v_ticket.id is null or v_ticket.ticket_type is distinct from 'paid_online' then
      v_status := 'NOT_ELIGIBLE';
    elsif coalesce(v_ticket.checked_in, false) or coalesce(v_ticket.checked_in_count, 0) > 0
      or v_link.child_checked_in_count > 0 then
      v_status := 'ALREADY_CHECKED_IN';
    elsif v_link.ticket_count is null or v_link.ticket_count < 1
      or cardinality(v_paid) <> v_link.ticket_count then
      v_status := 'PAID_SEAT_COUNT_MISMATCH';
    elsif cardinality(v_child) > least(3, v_link.child_seat_limit) then
      v_status := 'CHILD_LIMIT_EXCEEDED';
    elsif exists (select 1 from unnest(v_paid || v_child) requested(value)
      where value is null or value !~ '^[LR]-[A-J](10|[1-9])$') then
      v_status := 'INVALID_SEAT';
    elsif (select count(distinct value) from unnest(v_paid || v_child) requested(value))
      <> cardinality(v_paid) + cardinality(v_child) then
      v_status := 'DUPLICATE_SEAT';
    end if;
  end if;

  select coalesce(array_agg(seat_id order by seat_id) filter (where occupant_type = 'ticketed'), array[]::text[]),
    coalesce(array_agg(seat_id order by seat_id) filter (where occupant_type = 'child_free'), array[]::text[])
  into v_saved_paid, v_saved_child from public.show_reserved_seat_assignments
  where seating_link_id = v_link.id;

  if v_status is null and v_link.submitted_at is not null then
    if v_saved_paid = array(select value from unnest(v_paid) requested(value) order by value)
      and v_saved_child = array(select value from unnest(v_child) requested(value) order by value) then
      v_status := 'ALREADY_CONFIRMED';
    else
      v_status := 'ALREADY_SUBMITTED';
    end if;
  end if;
  if v_status is null and cardinality(v_saved_paid || v_saved_child) > 0 then
    -- Never overwrite partial legacy submissions or admin-assigned seats.
    v_status := 'EXISTING_ASSIGNMENTS';
  end if;
  if v_status is null and exists (select 1 from public.show_reserved_seat_assignments
    where show_id = v_link.show_id and seat_id = any(v_paid || v_child)) then
    v_status := 'SEAT_CONFLICT';
  end if;
  if v_status is not null then
    return query select v_status, v_link.id, cardinality(v_saved_paid), cardinality(v_saved_child),
      cardinality(v_saved_paid || v_saved_child), v_link.submitted_at;
    return;
  end if;

  -- The unique(show_id, seat_id) constraint arbitrates races with other reservations.
  -- This subtransaction rolls back every insert if even one seat conflicts.
  begin
    perform set_config('stageflow.child_mutation', 'allowed', true);
    insert into public.show_reserved_seat_assignments
      (show_id, seating_link_id, customer_name, email, seat_id, section, row_label,
       seat_number, assignment_type, seat_category, occupant_type, notes)
    select v_link.show_id, v_link.id, v_link.customer_name, v_link.email, requested.seat_id,
      split_part(requested.seat_id, '-', 1), substring(split_part(requested.seat_id, '-', 2) from 1 for 1),
      substring(split_part(requested.seat_id, '-', 2) from 2)::integer,
      'customer', 'paid_reserved', requested.kind,
      case when requested.kind = 'child_free' then '[Admission Type: free child 10 and under]' end
    from (select value as seat_id, 'ticketed'::text as kind from unnest(v_paid) seats(value)
      union all select value, 'child_free' from unnest(v_child) seats(value)) requested
    order by requested.seat_id;

    v_confirmed_at := clock_timestamp();
    update public.show_reserved_seating_links
    set submitted_at = v_confirmed_at, sent_at = coalesce(sent_at, v_confirmed_at), selection_mode = 'customer'
    where id = v_link.id;
    perform set_config('stageflow.child_mutation', coalesce(v_previous_guard, ''), true);
  exception when unique_violation then
    return query select 'SEAT_CONFLICT', v_link.id, 0, 0, 0, null::timestamptz;
    return;
  end;
  return query select 'CONFIRMED', v_link.id, cardinality(v_paid), cardinality(v_child),
    cardinality(v_paid || v_child), v_confirmed_at;
end
$$;

revoke all on function public.confirm_reserved_family_seats(text, text[], text[]) from public, anon, authenticated;
grant execute on function public.confirm_reserved_family_seats(text, text[], text[]) to service_role;

-- Legacy paid-only/comp links retain their up-to-ticket-count behavior, but cannot
-- write around an overlapping family confirmation or overwrite existing seats.
create function public.confirm_reserved_seats(p_selection_token text, p_paid_seat_ids text[])
returns table (result_status text, reservation_id uuid, paid_seat_count integer,
  child_seat_count integer, total_seat_count integer, submitted_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_link public.show_reserved_seating_links%rowtype;
  v_paid text[] := coalesce(p_paid_seat_ids, array[]::text[]);
  v_saved_paid text[];
  v_saved_child text[];
  v_status text;
  v_confirmed_at timestamptz;
begin
  select * into v_link from public.show_reserved_seating_links
  where selection_token = btrim(p_selection_token) for update;
  if not found then
    return query select 'NOT_FOUND', null::uuid, 0, 0, 0, null::timestamptz;
    return;
  end if;
  select coalesce(array_agg(seat_id order by seat_id) filter (where occupant_type = 'ticketed'), array[]::text[]),
    coalesce(array_agg(seat_id order by seat_id) filter (where occupant_type = 'child_free'), array[]::text[])
  into v_saved_paid, v_saved_child from public.show_reserved_seat_assignments where seating_link_id = v_link.id;

  if cardinality(v_paid) < 1 or cardinality(v_paid) > v_link.ticket_count then
    v_status := 'PAID_SEAT_COUNT_MISMATCH';
  elsif exists (select 1 from unnest(v_paid) requested(value)
    where value is null or value !~ '^[LR]-[A-J](10|[1-9])$') then
    v_status := 'INVALID_SEAT';
  elsif (select count(distinct value) from unnest(v_paid) requested(value)) <> cardinality(v_paid) then
    v_status := 'DUPLICATE_SEAT';
  elsif v_link.submitted_at is not null then
    v_status := case when cardinality(v_saved_child) = 0 and
      v_saved_paid = array(select value from unnest(v_paid) requested(value) order by value)
      then 'ALREADY_CONFIRMED' else 'ALREADY_SUBMITTED' end;
  elsif cardinality(v_saved_paid || v_saved_child) > 0 then
    v_status := 'EXISTING_ASSIGNMENTS';
  elsif exists (select 1 from public.show_reserved_seat_assignments
    where show_id = v_link.show_id and seat_id = any(v_paid)) then
    v_status := 'SEAT_CONFLICT';
  end if;
  if v_status is not null then
    return query select v_status, v_link.id, cardinality(v_saved_paid), cardinality(v_saved_child),
      cardinality(v_saved_paid || v_saved_child), v_link.submitted_at;
    return;
  end if;
  begin
    insert into public.show_reserved_seat_assignments
      (show_id, seating_link_id, customer_name, email, seat_id, section, row_label,
       seat_number, assignment_type, seat_category, occupant_type)
    select v_link.show_id, v_link.id, v_link.customer_name, v_link.email, value,
      split_part(value, '-', 1), substring(split_part(value, '-', 2) from 1 for 1),
      substring(split_part(value, '-', 2) from 2)::integer, 'customer',
      coalesce(nullif(btrim(v_link.seat_category), ''), case when v_link.is_complimentary then 'comp' else 'paid_reserved' end), 'ticketed'
    from unnest(v_paid) requested(value) order by value;
    v_confirmed_at := clock_timestamp();
    update public.show_reserved_seating_links set submitted_at = v_confirmed_at,
      sent_at = coalesce(sent_at, v_confirmed_at), selection_mode = 'customer' where id = v_link.id;
  exception when unique_violation then
    return query select 'SEAT_CONFLICT', v_link.id, 0, 0, 0, null::timestamptz;
    return;
  end;
  return query select 'CONFIRMED', v_link.id, cardinality(v_paid), 0, cardinality(v_paid), v_confirmed_at;
end
$$;
revoke all on function public.confirm_reserved_seats(text, text[]) from public, anon, authenticated;
grant execute on function public.confirm_reserved_seats(text, text[]) to service_role;

commit;

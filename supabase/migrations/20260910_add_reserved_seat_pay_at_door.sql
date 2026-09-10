alter table public.show_comp_tickets
  add column if not exists pay_at_door boolean not null default false,
  add column if not exists pay_at_door_amount numeric(10,2),
  add column if not exists pay_at_door_paid_at timestamptz,
  add column if not exists pay_at_door_payment_method text,
  add column if not exists pay_at_door_handled_by text,
  add column if not exists pay_at_door_finance_item_id uuid references public.show_finance_items(id) on delete set null;

alter table public.show_comp_tickets
  add constraint show_comp_tickets_pay_at_door_amount_check
    check (not pay_at_door or pay_at_door_amount > 0),
  add constraint show_comp_tickets_pay_at_door_method_check
    check (pay_at_door_payment_method is null or pay_at_door_payment_method in ('cash', 'external_card')),
  add constraint show_comp_tickets_pay_at_door_completion_check
    check (
      (pay_at_door_paid_at is null and pay_at_door_payment_method is null and pay_at_door_finance_item_id is null)
      or
      (pay_at_door and pay_at_door_paid_at is not null and pay_at_door_payment_method is not null and pay_at_door_finance_item_id is not null)
    );

alter table public.show_reserved_seating_links
  add column if not exists pay_at_door_intent boolean not null default false;

create or replace function public.apply_reserved_link_pay_at_door_intent(
  p_reserved_link_id uuid,
  p_ticket_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.show_comp_tickets as ticket
  set pay_at_door = true,
      pay_at_door_amount = coalesce(ticket.pay_at_door_amount, 10.00)
  from public.show_reserved_seating_links link
  where link.id = p_reserved_link_id
    and link.pay_at_door_intent
    and not link.is_complimentary
    and link.seat_category = 'paid_reserved'
    and ticket.id = p_ticket_id
    and ticket.show_id = link.show_id;
end;
$$;

create or replace function public.apply_projected_reserved_pay_at_door_intent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source_type = 'reserved_link' then
    perform public.apply_reserved_link_pay_at_door_intent(new.source_id, new.projected_ticket_id);
  end if;
  return new;
end;
$$;

create trigger apply_projected_reserved_pay_at_door_intent
after insert on public.show_admission_projection_sources
for each row execute function public.apply_projected_reserved_pay_at_door_intent();

create or replace function public.apply_direct_reserved_pay_at_door_intent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source_ticket_id is not null and new.pay_at_door_intent then
    perform public.apply_reserved_link_pay_at_door_intent(new.id, new.source_ticket_id);
  end if;
  return new;
end;
$$;

create trigger apply_direct_reserved_pay_at_door_intent
after insert or update of source_ticket_id, pay_at_door_intent on public.show_reserved_seating_links
for each row execute function public.apply_direct_reserved_pay_at_door_intent();

revoke all on function public.apply_reserved_link_pay_at_door_intent(uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_projected_reserved_pay_at_door_intent() from public, anon, authenticated;
revoke all on function public.apply_direct_reserved_pay_at_door_intent() from public, anon, authenticated;

create or replace function public.complete_reserved_seat_pay_at_door(
  p_show_id uuid,
  p_show_slug text,
  p_ticket_id uuid,
  p_payment_method text,
  p_handled_by text default null
)
returns table (
  result_status text,
  ticket_id uuid,
  amount numeric,
  payment_method text,
  paid_at timestamptz,
  checked_in_count integer,
  ticket_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.show_comp_tickets%rowtype;
  v_finance_id uuid;
  v_now timestamptz := now();
begin
  if p_payment_method not in ('cash', 'external_card') then
    raise exception 'Unsupported Pay at Door payment method.';
  end if;
  if not exists (select 1 from public.shows s where s.id = p_show_id and s.slug = btrim(p_show_slug)) then
    return query select 'WRONG_SHOW'::text, null::uuid, null::numeric, null::text, null::timestamptz, null::integer, null::integer;
    return;
  end if;

  select ticket.* into v_ticket
  from public.show_comp_tickets ticket
  where ticket.id = p_ticket_id and ticket.show_id = p_show_id
  for update;
  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, null::numeric, null::text, null::timestamptz, null::integer, null::integer;
    return;
  end if;
  if not v_ticket.pay_at_door then
    return query select 'NOT_PAY_AT_DOOR'::text, v_ticket.id, null::numeric, null::text, null::timestamptz, v_ticket.checked_in_count, v_ticket.ticket_count;
    return;
  end if;
  if v_ticket.pay_at_door_paid_at is not null then
    return query select 'ALREADY_PAID'::text, v_ticket.id, v_ticket.pay_at_door_amount, v_ticket.pay_at_door_payment_method, v_ticket.pay_at_door_paid_at, v_ticket.checked_in_count, v_ticket.ticket_count;
    return;
  end if;
  if v_ticket.checked_in_count > 0 then
    return query select 'ALREADY_CHECKED_IN'::text, v_ticket.id, v_ticket.pay_at_door_amount, null::text, null::timestamptz, v_ticket.checked_in_count, v_ticket.ticket_count;
    return;
  end if;

  insert into public.show_finance_items (
    show_id, type, category, label, amount, notes, source, source_kind,
    currency, original_amount_cents, occurred_at, imported_at, is_system_managed
  ) values (
    p_show_id, 'income', 'Door Sales', 'Reserved Seat Pay at Door', v_ticket.pay_at_door_amount,
    case when p_payment_method = 'cash' then 'Reserved Seat Pay at Door · Cash' else 'Card Payment at Door — External Reader' end,
    'stageflow', 'reserved_seat_pay_at_door', 'USD', round(v_ticket.pay_at_door_amount * 100)::bigint,
    v_now, v_now, true
  ) returning id into v_finance_id;

  update public.show_comp_tickets as ticket
  set pay_at_door_paid_at = v_now,
      pay_at_door_payment_method = p_payment_method,
      pay_at_door_handled_by = nullif(btrim(p_handled_by), ''),
      pay_at_door_finance_item_id = v_finance_id,
      checked_in_count = ticket.ticket_count,
      checked_in = true
  where ticket.id = v_ticket.id and ticket.show_id = p_show_id;

  return query select 'PAID_AND_CHECKED_IN'::text, v_ticket.id, v_ticket.pay_at_door_amount,
    p_payment_method, v_now, v_ticket.ticket_count, v_ticket.ticket_count;
end;
$$;

revoke all on function public.complete_reserved_seat_pay_at_door(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_reserved_seat_pay_at_door(uuid, text, uuid, text, text) to service_role;

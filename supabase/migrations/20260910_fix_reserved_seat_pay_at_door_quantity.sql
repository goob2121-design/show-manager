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
      pay_at_door_amount = coalesce(ticket.pay_at_door_amount, ticket.ticket_count * 10.00)
  from public.show_reserved_seating_links link
  where link.id = p_reserved_link_id
    and link.pay_at_door_intent
    and not link.is_complimentary
    and link.seat_category = 'paid_reserved'
    and ticket.id = p_ticket_id
    and ticket.show_id = link.show_id;
end;
$$;

revoke all on function public.apply_reserved_link_pay_at_door_intent(uuid, uuid) from public, anon, authenticated;

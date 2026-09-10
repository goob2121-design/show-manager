create function public.undo_sponsor_comp_redemption_token(
  p_show_id uuid,
  p_show_slug text,
  p_token_id uuid,
  p_undone_by text default null
)
returns table (
  result_status text,
  token_id uuid,
  show_sponsor_id uuid,
  sponsor_name text,
  ordinal integer,
  allowance integer,
  checked_in integer,
  remaining integer,
  redeemed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token public.show_sponsor_comp_redemption_tokens%rowtype;
  v_sponsor public.show_sponsors%rowtype;
  v_name text;
begin
  if not exists (
    select 1
    from public.shows
    where id = p_show_id
      and slug = btrim(p_show_slug)
  ) then
    return query select 'WRONG_SHOW'::text, null::uuid, null::uuid, null::text, null::integer, null::integer, null::integer, null::integer, null::timestamptz;
    return;
  end if;

  select token_row.*
    into v_token
  from public.show_sponsor_comp_redemption_tokens token_row
  where token_row.id = p_token_id;

  if not found or v_token.show_id <> p_show_id then
    return query select 'WRONG_SHOW'::text, null::uuid, null::uuid, null::text, null::integer, null::integer, null::integer, null::integer, null::timestamptz;
    return;
  end if;

  -- Match redemption's sponsor-then-token lock order so scans, undos, and
  -- allowance changes for the same allocation serialize deterministically.
  select sponsor.*
    into v_sponsor
  from public.show_sponsors sponsor
  where sponsor.id = v_token.show_sponsor_id
    and sponsor.show_id = p_show_id
  for update;

  if not found then
    raise exception 'Sponsor allocation not found.';
  end if;

  select token_row.*
    into v_token
  from public.show_sponsor_comp_redemption_tokens token_row
  where token_row.id = p_token_id
    and token_row.show_id = p_show_id
    and token_row.show_sponsor_id = v_sponsor.id
  for update;

  if not found then
    return query select 'WRONG_SHOW'::text, null::uuid, null::uuid, null::text, null::integer, null::integer, null::integer, null::integer, null::timestamptz;
    return;
  end if;

  select coalesce(nullif(btrim(library.name), ''), nullif(btrim(v_sponsor.custom_note), ''), 'Sponsor')
    into v_name
  from public.sponsor_library library
  where library.id = v_sponsor.sponsor_id;
  v_name := coalesce(v_name, nullif(btrim(v_sponsor.custom_note), ''), 'Sponsor');

  if v_token.voided_at is not null then
    return query select 'VOIDED', v_token.id, v_sponsor.id, v_name, v_token.ordinal, v_sponsor.comp_ticket_allowance, v_sponsor.comp_tickets_checked_in, greatest(0, v_sponsor.comp_ticket_allowance - v_sponsor.comp_tickets_checked_in), v_token.redeemed_at;
    return;
  end if;

  if v_token.redeemed_at is null then
    return query select 'NOT_REDEEMED', v_token.id, v_sponsor.id, v_name, v_token.ordinal, v_sponsor.comp_ticket_allowance, v_sponsor.comp_tickets_checked_in, greatest(0, v_sponsor.comp_ticket_allowance - v_sponsor.comp_tickets_checked_in), null::timestamptz;
    return;
  end if;

  if v_sponsor.comp_tickets_checked_in <= 0 then
    return query select 'COUNT_ZERO', v_token.id, v_sponsor.id, v_name, v_token.ordinal, v_sponsor.comp_ticket_allowance, v_sponsor.comp_tickets_checked_in, greatest(0, v_sponsor.comp_ticket_allowance - v_sponsor.comp_tickets_checked_in), v_token.redeemed_at;
    return;
  end if;

  update public.show_sponsors
  set comp_tickets_checked_in = comp_tickets_checked_in - 1
  where id = v_sponsor.id
    and show_id = p_show_id;

  update public.show_sponsor_comp_redemption_tokens
  set redeemed_at = null,
      redeemed_by = null
  where id = v_token.id
    and show_id = p_show_id
    and show_sponsor_id = v_sponsor.id;

  v_sponsor.comp_tickets_checked_in := v_sponsor.comp_tickets_checked_in - 1;

  return query select 'UNDONE', v_token.id, v_sponsor.id, v_name, v_token.ordinal, v_sponsor.comp_ticket_allowance, v_sponsor.comp_tickets_checked_in, greatest(0, v_sponsor.comp_ticket_allowance - v_sponsor.comp_tickets_checked_in), null::timestamptz;
end;
$$;

revoke all on function public.undo_sponsor_comp_redemption_token(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.undo_sponsor_comp_redemption_token(uuid, text, uuid, text) to service_role;

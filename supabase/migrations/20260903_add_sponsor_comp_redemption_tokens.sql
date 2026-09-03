create table public.show_sponsor_comp_redemption_tokens (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  show_sponsor_id uuid not null references public.show_sponsors(id) on delete restrict,
  token text not null,
  ordinal integer not null,
  redeemed_at timestamptz,
  redeemed_by text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint show_sponsor_comp_redemption_tokens_token_unique unique (token),
  constraint show_sponsor_comp_redemption_tokens_sponsor_ordinal_unique unique (show_sponsor_id, ordinal),
  constraint show_sponsor_comp_redemption_tokens_ordinal_positive check (ordinal > 0),
  constraint show_sponsor_comp_redemption_tokens_token_format check (token ~ '^stf_scomp_[A-Za-z0-9_-]+$'),
  constraint show_sponsor_comp_redemption_tokens_not_redeemed_and_voided
    check (redeemed_at is null or voided_at is null)
);

create unique index show_sponsors_id_show_id_unique
  on public.show_sponsors(id, show_id);

alter table public.show_sponsor_comp_redemption_tokens
  add constraint show_sponsor_comp_redemption_tokens_sponsor_show_fk
  foreign key (show_sponsor_id, show_id)
  references public.show_sponsors(id, show_id)
  on delete restrict;

create index show_sponsor_comp_redemption_tokens_show_idx
  on public.show_sponsor_comp_redemption_tokens(show_id, show_sponsor_id, ordinal);

alter table public.show_sponsor_comp_redemption_tokens enable row level security;
revoke all on table public.show_sponsor_comp_redemption_tokens from public, anon, authenticated;
grant select, insert, update on table public.show_sponsor_comp_redemption_tokens to service_role;

create function public.generate_sponsor_comp_redemption_tokens(
  p_show_id uuid,
  p_show_sponsor_id uuid,
  p_tokens text[]
)
returns setof public.show_sponsor_comp_redemption_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowance integer;
  v_existing_count integer;
begin
  select sponsor.comp_ticket_allowance
    into v_allowance
  from public.show_sponsors sponsor
  where sponsor.id = p_show_sponsor_id
    and sponsor.show_id = p_show_id
  for update;

  if not found then raise exception 'Sponsor allocation not found.'; end if;
  if v_allowance <= 0 then raise exception 'Sponsor allocation has no complimentary tickets.'; end if;

  select count(*)::integer into v_existing_count
  from public.show_sponsor_comp_redemption_tokens token_row
  where token_row.show_sponsor_id = p_show_sponsor_id;

  if v_existing_count = v_allowance then
    return query select token_row.* from public.show_sponsor_comp_redemption_tokens token_row
      where token_row.show_sponsor_id = p_show_sponsor_id order by token_row.ordinal;
    return;
  end if;

  if v_existing_count <> 0 then
    raise exception 'Sponsor token allocation is incomplete and requires review.';
  end if;
  if coalesce(array_length(p_tokens, 1), 0) <> v_allowance then
    raise exception 'Exactly % sponsor redemption tokens are required.', v_allowance;
  end if;
  if exists (select 1 from unnest(p_tokens) value where value !~ '^stf_scomp_[A-Za-z0-9_-]+$') then
    raise exception 'Invalid sponsor redemption token format.';
  end if;
  if (select count(distinct value) from unnest(p_tokens) value) <> v_allowance then
    raise exception 'Sponsor redemption tokens must be unique.';
  end if;

  insert into public.show_sponsor_comp_redemption_tokens (show_id, show_sponsor_id, token, ordinal)
  select p_show_id, p_show_sponsor_id, value, ordinality::integer
  from unnest(p_tokens) with ordinality as generated(value, ordinality);

  return query select token_row.* from public.show_sponsor_comp_redemption_tokens token_row
    where token_row.show_sponsor_id = p_show_sponsor_id order by token_row.ordinal;
end;
$$;

revoke all on function public.generate_sponsor_comp_redemption_tokens(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.generate_sponsor_comp_redemption_tokens(uuid, uuid, text[]) to service_role;

create function public.redeem_sponsor_comp_redemption_token(
  p_show_id uuid,
  p_show_slug text,
  p_token text,
  p_redeemed_by text default null
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
  v_now timestamptz := now();
begin
  if not exists (select 1 from public.shows where id = p_show_id and slug = btrim(p_show_slug)) then
    return query select 'WRONG_SHOW'::text, null::uuid, null::uuid, null::text, null::integer, null::integer, null::integer, null::integer, null::timestamptz;
    return;
  end if;

  select token_row.* into v_token
  from public.show_sponsor_comp_redemption_tokens token_row
  where token_row.token = btrim(p_token);
  if not found or v_token.show_id <> p_show_id then
    return query select 'WRONG_SHOW'::text, null::uuid, null::uuid, null::text, null::integer, null::integer, null::integer, null::integer, null::timestamptz;
    return;
  end if;

  select sponsor.* into v_sponsor from public.show_sponsors sponsor
  where sponsor.id = v_token.show_sponsor_id and sponsor.show_id = p_show_id for update;
  if not found then raise exception 'Sponsor allocation not found.'; end if;

  select token_row.* into v_token from public.show_sponsor_comp_redemption_tokens token_row
  where token_row.id = v_token.id and token_row.show_id = p_show_id for update;

  select coalesce(nullif(btrim(library.name), ''), nullif(btrim(v_sponsor.custom_note), ''), 'Sponsor')
    into v_name from public.sponsor_library library where library.id = v_sponsor.sponsor_id;
  v_name := coalesce(v_name, nullif(btrim(v_sponsor.custom_note), ''), 'Sponsor');

  if v_token.voided_at is not null then
    return query select 'VOIDED', v_token.id, v_sponsor.id, v_name, v_token.ordinal, v_sponsor.comp_ticket_allowance, v_sponsor.comp_tickets_checked_in, greatest(0, v_sponsor.comp_ticket_allowance - v_sponsor.comp_tickets_checked_in), v_token.redeemed_at;
    return;
  end if;
  if v_token.redeemed_at is not null then
    return query select 'ALREADY_REDEEMED', v_token.id, v_sponsor.id, v_name, v_token.ordinal, v_sponsor.comp_ticket_allowance, v_sponsor.comp_tickets_checked_in, greatest(0, v_sponsor.comp_ticket_allowance - v_sponsor.comp_tickets_checked_in), v_token.redeemed_at;
    return;
  end if;
  if v_sponsor.comp_tickets_checked_in >= v_sponsor.comp_ticket_allowance then
    return query select 'ALLOCATION_FULL', v_token.id, v_sponsor.id, v_name, v_token.ordinal, v_sponsor.comp_ticket_allowance, v_sponsor.comp_tickets_checked_in, 0, null::timestamptz;
    return;
  end if;

  update public.show_sponsors set comp_tickets_checked_in = comp_tickets_checked_in + 1 where id = v_sponsor.id;
  update public.show_sponsor_comp_redemption_tokens set redeemed_at = v_now, redeemed_by = nullif(btrim(p_redeemed_by), '') where id = v_token.id;
  v_sponsor.comp_tickets_checked_in := v_sponsor.comp_tickets_checked_in + 1;

  return query select 'REDEEMED', v_token.id, v_sponsor.id, v_name, v_token.ordinal, v_sponsor.comp_ticket_allowance, v_sponsor.comp_tickets_checked_in, greatest(0, v_sponsor.comp_ticket_allowance - v_sponsor.comp_tickets_checked_in), v_now;
end;
$$;

revoke all on function public.redeem_sponsor_comp_redemption_token(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.redeem_sponsor_comp_redemption_token(uuid, text, text, text) to service_role;

create function public.enforce_sponsor_comp_token_allowance_floor()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_highest_issued integer;
begin
  if new.comp_ticket_allowance = old.comp_ticket_allowance then return new; end if;
  select coalesce(max(token_row.ordinal), 0) into v_highest_issued
  from public.show_sponsor_comp_redemption_tokens token_row
  where token_row.show_sponsor_id = new.id and token_row.voided_at is null;
  if new.comp_ticket_allowance < greatest(new.comp_tickets_checked_in, v_highest_issued) then
    raise exception 'Comp ticket allowance cannot be lower than checked-in or issued sponsor redemption positions.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_sponsor_comp_token_allowance_floor() from public, anon, authenticated;

create trigger enforce_sponsor_comp_token_allowance_floor
before update of comp_ticket_allowance on public.show_sponsors
for each row execute function public.enforce_sponsor_comp_token_allowance_floor();

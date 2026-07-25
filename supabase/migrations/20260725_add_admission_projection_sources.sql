create table public.show_admission_projection_sources (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  projected_ticket_id uuid not null references public.show_comp_tickets(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint show_admission_projection_sources_source_type_check
    check (source_type in ('reserved_link', 'reserved_assignment')),
  constraint show_admission_projection_sources_show_source_unique
    unique (show_id, source_type, source_id)
);

create index show_admission_projection_sources_projected_ticket_idx
  on public.show_admission_projection_sources(projected_ticket_id);

alter table public.show_admission_projection_sources enable row level security;

revoke all on table public.show_admission_projection_sources from public, anon, authenticated;
grant select, insert on table public.show_admission_projection_sources to service_role;

do $$
begin
  if to_regprocedure('public.prepare_show_check_in_list(uuid,text)') is not null then
    raise exception 'Migration stopped: public.prepare_show_check_in_list(uuid, text) already exists.';
  end if;
end
$$;

create function public.prepare_show_check_in_list(
  p_show_id uuid,
  p_show_slug text
)
returns table (
  source_type text,
  source_id uuid,
  display_label text,
  admission_type text,
  destination text,
  result_status text,
  reason text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link record;
  v_assignment record;
  v_ticket_id uuid;
  v_label text;
  v_category text;
  v_notes text;
begin
  if not exists (
    select 1
    from public.shows
    where id = p_show_id
      and slug = btrim(p_show_slug)
  ) then
    raise exception 'Show not found.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_show_id::text, 0));

  return query
  select
    'ticket'::text,
    ticket.id,
    coalesce(nullif(btrim(ticket.guest_name), ''), 'Unnamed Ticket Entry'),
    case
      when ticket.ticket_type = 'paid_online' and lower(coalesce(ticket.notes, '')) like '%reserved%'
        then 'Paid Reserved'
      when ticket.ticket_type = 'paid_online' then 'Paid General Admission'
      when ticket.ticket_type = 'door_paid' then 'Paid Door'
      when lower(coalesce(ticket.notes, '')) like '%[comp type: band]%' then 'Band Comp'
      when lower(coalesce(ticket.notes, '')) like '%[comp type: media]%'
        or lower(coalesce(ticket.notes, '')) like '%[comp type: press]%' then 'Media'
      when lower(coalesce(ticket.notes, '')) like '%[comp type: volunteer]%' then 'Volunteer'
      when lower(coalesce(ticket.notes, '')) like '%[comp type: staff]%' then 'Staff'
      when lower(coalesce(ticket.notes, '')) like '%[comp type: other]%' then 'Other'
      else 'Guest Comp'
    end,
    case
      when ticket.ticket_type = 'paid_online' then 'Prepaid / Online Check-In'
      when ticket.ticket_type = 'door_paid' then 'Paid Door'
      else 'Special Admissions'
    end,
    case when ticket.ticket_type = 'door_paid' then 'already_handled' else 'already_present' end,
    case
      when ticket.ticket_type = 'door_paid' then 'Already handled by Paid Door controls.'
      else 'Existing check-in ticket was not modified.'
    end
  from public.show_comp_tickets ticket
  where ticket.show_id = p_show_id;

  for v_link in
    select link.*
    from public.show_reserved_seating_links link
    where link.show_id = p_show_id
    order by link.created_at, link.id
  loop
    v_label := coalesce(
      nullif(btrim(v_link.customer_name), ''),
      nullif(btrim(v_link.source_note), ''),
      'Unnamed Reserved Admission'
    );

    if v_link.source_ticket_id is not null and exists (
      select 1
      from public.show_comp_tickets ticket
      where ticket.id = v_link.source_ticket_id
        and ticket.show_id = p_show_id
    ) then
      return query select
        'reserved_link'::text, v_link.id, v_label, 'Existing Reserved Admission'::text,
        'Prepaid / Online Check-In'::text, 'already_present'::text,
        'Reserved link already points to an existing check-in ticket.'::text;
      continue;
    end if;

    select ledger.projected_ticket_id
      into v_ticket_id
    from public.show_admission_projection_sources ledger
    where ledger.show_id = p_show_id
      and ledger.source_type = 'reserved_link'
      and ledger.source_id = v_link.id;

    if v_ticket_id is not null then
      return query select
        'reserved_link'::text, v_link.id, v_label, 'Existing Reserved Admission'::text,
        case
          when coalesce(v_link.is_complimentary, false) then 'Special Admissions'
          else 'Prepaid / Online Check-In'
        end::text,
        'already_present'::text,
        'A projection ledger entry already exists for this reserved link.'::text;
      v_ticket_id := null;
      continue;
    end if;

    if v_link.source_ticket_id is not null then
      return query select
        'reserved_link'::text, v_link.id, v_label, 'Needs Review'::text,
        'Needs Review'::text, 'skipped'::text,
        'Reserved link ownership does not resolve to a ticket for this show.'::text;
      continue;
    end if;

    if not coalesce(v_link.is_complimentary, false)
      and coalesce(v_link.seat_category, '') = 'paid_reserved' then
      begin
        insert into public.show_comp_tickets (
          show_id, guest_name, ticket_count, ticket_type, notes, checked_in, checked_in_count
        ) values (
          p_show_id,
          v_label,
          greatest(coalesce(v_link.ticket_count, 1), 1),
          'paid_online',
          '[Admission Type: reserved] Prepared from paid reserved seating admission.',
          false,
          0
        )
        returning id into v_ticket_id;

        insert into public.show_admission_projection_sources (
          show_id, source_type, source_id, projected_ticket_id
        ) values (
          p_show_id, 'reserved_link', v_link.id, v_ticket_id
        );

        return query select
          'reserved_link'::text, v_link.id, v_label, 'Paid Reserved'::text,
          'Prepaid / Online Check-In'::text, 'added'::text,
          'Created one missing paid reserved check-in entry.'::text;
      exception when unique_violation then
        return query select
          'reserved_link'::text, v_link.id, v_label, 'Paid Reserved'::text,
          'Prepaid / Online Check-In'::text, 'already_present'::text,
          'A projection for this reserved link already exists.'::text;
      when others then
        return query select
          'reserved_link'::text, v_link.id, v_label, 'Paid Reserved'::text,
          'Prepaid / Online Check-In'::text, 'error'::text,
          'Unable to create the check-in projection for this source.'::text;
      end;
      continue;
    end if;

    if coalesce(v_link.is_complimentary, false)
      or coalesce(v_link.seat_category, '') in ('comp', 'guest') then
      v_category := case
        when lower(coalesce(v_link.source_note, '')) ~ '\[comp type:\s*band\]' then 'band'
        when lower(coalesce(v_link.source_note, '')) ~ '\[comp type:\s*(media|press)\]' then 'media'
        when lower(coalesce(v_link.source_note, '')) ~ '\[comp type:\s*volunteer\]' then 'volunteer'
        when lower(coalesce(v_link.source_note, '')) ~ '\[comp type:\s*staff\]' then 'staff'
        when lower(coalesce(v_link.source_note, '')) ~ '\[comp type:\s*other\]' then 'other'
        when lower(coalesce(v_link.source_note, '')) ~ '\[comp type:\s*guest\]'
          or coalesce(v_link.seat_category, '') = 'guest' then 'guest'
        else 'other'
      end;
      v_notes := format(
        '[Comp Type: %s] [Admission Type: reserved] Prepared from complimentary reserved seating admission.',
        v_category
      );

      begin
        insert into public.show_comp_tickets (
          show_id, guest_name, ticket_count, ticket_type, notes, checked_in, checked_in_count
        ) values (
          p_show_id,
          v_label,
          greatest(coalesce(v_link.ticket_count, 1), 1),
          'complimentary',
          v_notes,
          false,
          0
        )
        returning id into v_ticket_id;

        insert into public.show_admission_projection_sources (
          show_id, source_type, source_id, projected_ticket_id
        ) values (
          p_show_id, 'reserved_link', v_link.id, v_ticket_id
        );

        return query select
          'reserved_link'::text, v_link.id, v_label,
          case v_category
            when 'band' then 'Band Comp'
            when 'media' then 'Media'
            when 'volunteer' then 'Volunteer'
            when 'staff' then 'Staff'
            when 'guest' then 'Guest Comp'
            else 'Other'
          end,
          'Special Admissions'::text, 'added'::text,
          'Created one missing special-admission check-in entry.'::text;
      exception when unique_violation then
        return query select
          'reserved_link'::text, v_link.id, v_label, 'Reserved Comp'::text,
          'Special Admissions'::text, 'already_present'::text,
          'A projection for this reserved link already exists.'::text;
      when others then
        return query select
          'reserved_link'::text, v_link.id, v_label, 'Reserved Comp'::text,
          'Special Admissions'::text, 'error'::text,
          'Unable to create the check-in projection for this source.'::text;
      end;
      continue;
    end if;

    return query select
      'reserved_link'::text, v_link.id, v_label, 'Needs Review'::text,
      'Needs Review'::text, 'skipped'::text,
      'Reserved admission classification is ambiguous.'::text;
  end loop;

  for v_assignment in
    select assignment.*
    from public.show_reserved_seat_assignments assignment
    where assignment.show_id = p_show_id
      and assignment.seating_link_id is null
    order by assignment.created_at, assignment.id
  loop
    v_label := coalesce(
      nullif(btrim(v_assignment.notes), ''),
      'Unnamed Reserved Assignment'
    );

    select ledger.projected_ticket_id
      into v_ticket_id
    from public.show_admission_projection_sources ledger
    where ledger.show_id = p_show_id
      and ledger.source_type = 'reserved_assignment'
      and ledger.source_id = v_assignment.id;

    if v_ticket_id is not null then
      return query select
        'reserved_assignment'::text, v_assignment.id, v_label, 'Existing Reserved Assignment'::text,
        case when v_assignment.seat_category = 'paid_reserved'
          then 'Prepaid / Online Check-In' else 'Special Admissions' end::text,
        'already_present'::text,
        'A projection ledger entry already exists for this reserved assignment.'::text;
      v_ticket_id := null;
      continue;
    end if;

    if v_assignment.assignment_type <> 'customer'
      or coalesce(v_assignment.seat_category, '') not in ('paid_reserved', 'comp', 'guest') then
      return query select
        'reserved_assignment'::text, v_assignment.id, v_label, 'Needs Review'::text,
        'Needs Review'::text, 'skipped'::text,
        'Unlinked assignment does not unambiguously represent an admission.'::text;
      continue;
    end if;

    if v_assignment.seat_category in ('comp', 'guest')
      and nullif(btrim(coalesce(v_assignment.notes, '')), '') is null then
      return query select
        'reserved_assignment'::text, v_assignment.id, v_label, 'Needs Review'::text,
        'Needs Review'::text, 'skipped'::text,
        'Unnamed complimentary assignment requires review before synchronization.'::text;
      continue;
    end if;

    v_category := case
      when v_assignment.seat_category = 'paid_reserved' then null
      when lower(coalesce(v_assignment.notes, '')) ~ '\[comp type:\s*band\]' then 'band'
      when lower(coalesce(v_assignment.notes, '')) ~ '\[comp type:\s*(media|press)\]' then 'media'
      when lower(coalesce(v_assignment.notes, '')) ~ '\[comp type:\s*volunteer\]' then 'volunteer'
      when lower(coalesce(v_assignment.notes, '')) ~ '\[comp type:\s*staff\]' then 'staff'
      when lower(coalesce(v_assignment.notes, '')) ~ '\[comp type:\s*other\]' then 'other'
      when lower(coalesce(v_assignment.notes, '')) ~ '\[comp type:\s*guest\]'
        or v_assignment.seat_category = 'guest' then 'guest'
      else 'other'
    end;
    v_notes := case
      when v_assignment.seat_category = 'paid_reserved'
        then '[Admission Type: reserved] Prepared from unlinked paid reserved seat assignment.'
      else format(
        '[Comp Type: %s] [Admission Type: reserved] Prepared from unlinked reserved seat assignment.',
        v_category
      )
    end;

    begin
      insert into public.show_comp_tickets (
        show_id, guest_name, ticket_count, ticket_type, notes, checked_in, checked_in_count
      ) values (
        p_show_id,
        v_label,
        1,
        case when v_assignment.seat_category = 'paid_reserved' then 'paid_online' else 'complimentary' end,
        v_notes,
        false,
        0
      )
      returning id into v_ticket_id;

      insert into public.show_admission_projection_sources (
        show_id, source_type, source_id, projected_ticket_id
      ) values (
        p_show_id, 'reserved_assignment', v_assignment.id, v_ticket_id
      );

      return query select
        'reserved_assignment'::text, v_assignment.id, v_label,
        case
          when v_assignment.seat_category = 'paid_reserved' then 'Paid Reserved'
          when v_category = 'band' then 'Band Comp'
          when v_category = 'media' then 'Media'
          when v_category = 'volunteer' then 'Volunteer'
          when v_category = 'staff' then 'Staff'
          when v_category = 'guest' then 'Guest Comp'
          else 'Other'
        end,
        case when v_assignment.seat_category = 'paid_reserved'
          then 'Prepaid / Online Check-In' else 'Special Admissions' end::text,
        'added'::text,
        'Created one missing check-in entry for an unlinked reserved assignment.'::text;
    exception when unique_violation then
      return query select
        'reserved_assignment'::text, v_assignment.id, v_label, 'Reserved Assignment'::text,
        case when v_assignment.seat_category = 'paid_reserved'
          then 'Prepaid / Online Check-In' else 'Special Admissions' end::text,
        'already_present'::text,
        'A projection for this reserved assignment already exists.'::text;
    when others then
      return query select
        'reserved_assignment'::text, v_assignment.id, v_label, 'Reserved Assignment'::text,
        'Needs Review'::text, 'error'::text,
        'Unable to create the check-in projection for this source.'::text;
    end;
  end loop;

  return query
  select
    'show_sponsor'::text,
    sponsor.id,
    coalesce(nullif(btrim(library.name), ''), 'Unnamed Sponsor'),
    'Sponsor Comp'::text,
    'Sponsor Comp Check-In'::text,
    'already_handled'::text,
    'Already handled by Sponsor Comp Check-In.'::text
  from public.show_sponsors sponsor
  left join public.sponsor_library library on library.id = sponsor.sponsor_id
  where sponsor.show_id = p_show_id
    and coalesce(sponsor.comp_ticket_allowance, 0) > 0;
end;
$$;

revoke all on function public.prepare_show_check_in_list(uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_show_check_in_list(uuid, text) to service_role;

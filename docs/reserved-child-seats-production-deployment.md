# Reserved Child Seating Production Deployment

The public feature flag must remain disabled throughout both phases. Run each phase in a low-traffic window only after confirming a current Supabase backup or point-in-time recovery checkpoint.

## Phase 1: Additive Schema

Migration: `20261012_add_reserved_child_seats.sql`

This phase adds columns, constraints, an index, guards, and RPCs. It preserves the existing reserved-seating RLS policies and table privileges so the currently deployed application continues to operate.

### Preflight SQL

```sql
select
  (select count(*) from public.show_reserved_seating_links) as reservation_count,
  (select count(*) from public.show_reserved_seat_assignments) as assignment_count,
  (select count(*) from public.show_reserved_seat_assignments where assignment_type = 'blocked') as blocked_count;

select count(*) as duplicate_seat_keys
from (
  select show_id, seat_id
  from public.show_reserved_seat_assignments
  group by show_id, seat_id
  having count(*) > 1
) duplicates;

select count(*) as orphan_assignments
from public.show_reserved_seat_assignments assignment
left join public.show_reserved_seating_links link on link.id = assignment.seating_link_id
where assignment.seating_link_id is not null and link.id is null;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('show_reserved_seating_links', 'show_reserved_seat_assignments')
  and column_name in ('child_seat_limit', 'child_checked_in_count', 'occupant_type');
```

STOP if counts differ unexpectedly from the immediately preceding production snapshot, duplicates or orphans are nonzero, or any pending column exists without a documented prior migration attempt.

### Post-Phase-1 SQL

```sql
select
  (select count(*) from public.show_reserved_seating_links) as reservation_count,
  (select count(*) from public.show_reserved_seat_assignments) as assignment_count,
  (select count(*) from public.show_reserved_seat_assignments where occupant_type = 'ticketed') as ticketed_assignment_count,
  (select count(*) from public.show_reserved_seat_assignments where occupant_type = 'child_free') as child_assignment_count;

select
  count(*) filter (where ticket.ticket_type = 'paid_online' and link.child_seat_limit >= 3) as eligible_with_allowance,
  count(*) filter (where ticket.ticket_type = 'paid_online' and link.child_seat_limit < 3) as eligible_missing_allowance,
  count(*) filter (where coalesce(ticket.ticket_type, '') <> 'paid_online' and link.child_seat_limit > 0) as ineligible_with_allowance
from public.show_reserved_seating_links link
left join public.show_comp_tickets ticket
  on ticket.id = link.source_ticket_id and ticket.show_id = link.show_id;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'replace_reserved_family_seats',
    'set_reserved_child_seat_limit',
    'adjust_reserved_family_check_in',
    'admin_reset_reserved_family_seats',
    'admin_delete_reserved_family_link'
  )
order by routine_name;

select policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('show_reserved_seating_links', 'show_reserved_seat_assignments')
order by tablename, policyname;
```

STOP if reservation or assignment counts change, any existing assignment is not `ticketed`, any child assignment exists before feature use, an eligible paid-online link is missing its allowance, an ineligible direct-ticket link gains an allowance, an RPC is missing, or any legacy policy disappeared.

After Phase 1, smoke-test the currently deployed application. Then deploy the updated application with `STAGEFLOW_ENABLE_CHILD_RESERVED_SEATS` unset or `false`. Verify admin seating, customer token pages, public availability, sponsor/comp seating, printing, Square ingestion, Door Mode lookup/check-in, email, reset, and deletion before proceeding.

## Phase 2: Reserved-Seating Security

Migration: `20261013_secure_reserved_seating_access.sql`

This phase removes the legacy permissive policies and revokes direct table privileges from `anon` and `authenticated`. Server routes continue through the server-only service-role client.

### Preflight SQL

```sql
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('show_reserved_seating_links', 'show_reserved_seat_assignments')
order by tablename, policyname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('show_reserved_seating_links', 'show_reserved_seat_assignments')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

STOP unless the updated application is deployed, the feature remains disabled, every smoke test above passes, and service-role configuration is present only on the server.

### Post-Phase-2 SQL

```sql
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('show_reserved_seating_links', 'show_reserved_seat_assignments')
order by tablename, policyname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('show_reserved_seating_links', 'show_reserved_seat_assignments')
  and grantee in ('anon', 'authenticated');

select
  (select count(*) from public.show_reserved_seating_links) as reservation_count,
  (select count(*) from public.show_reserved_seat_assignments) as assignment_count;
```

The policy and privilege queries must return no access for `anon` or `authenticated`, while row counts remain unchanged. Confirm anonymous REST selects now fail and repeat every server-route smoke test. STOP if a server workflow fails; do not enable the feature.

## Recovery

Both migrations use transactions, so an error before commit should roll back that phase. Do not drop Phase-1 columns or child data as an immediate rollback; leave the additive schema in place, keep the feature disabled, and forward-fix the application or RPC.

If Phase 2 breaks a missed legacy workflow, keep the feature disabled and redeploy the verified updated application or restore only the exact legacy policies and grants from the preflight catalog snapshot as a temporary emergency measure. Do not restore broad access from memory. Use point-in-time recovery only for confirmed data corruption, not for an application routing failure.

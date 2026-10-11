-- PROPOSED / UNAPPLIED. Do NOT apply the separate Phase 3C four-table migration.
-- One row per show, including pre-session PIN attempts. Server-only registry.
begin;
create table public.lyric_sync_sessions (
  show_id uuid primary key references public.shows(id),
  session_id uuid unique,
  publisher_id uuid,
  proof_hash text check (proof_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  latest_sequence bigint not null default 0 check (latest_sequence >= 0),
  latest_state jsonb,
  last_update_id uuid,
  attempt_window timestamptz not null default clock_timestamp(),
  attempt_count integer not null default 0 check (attempt_count between 0 and 6),
  check ((session_id is null and publisher_id is null and proof_hash is null and created_at is null
    and expires_at is null and latest_state is null)
    or (session_id is not null and publisher_id is not null and proof_hash is not null
      and created_at is not null and expires_at is not null and latest_state is not null
      and expires_at > created_at and expires_at <= created_at + interval '12 hours'))
);
alter table public.lyric_sync_sessions enable row level security;
revoke all on public.lyric_sync_sessions from public, anon, authenticated;
grant select, insert, update on public.lyric_sync_sessions to service_role;

create function public.lyric_sync_registry(p_operation text, p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r public.lyric_sync_sessions%rowtype;
  show_uuid uuid;
  n timestamptz;
  state_value jsonb;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then raise exception 'Invalid lyric operation'; end if;
  show_uuid := (p_input->>'showId')::uuid;
  if p_operation = 'attempt' then
    -- Creates the single show row before its first session. FK rejects unknown shows.
    insert into public.lyric_sync_sessions(show_id) values (show_uuid) on conflict (show_id) do nothing;
  end if;
  select * into r from public.lyric_sync_sessions where show_id = show_uuid for update;
  n := clock_timestamp(); -- Expiry is checked AFTER acquiring the row lock.
  if not found then return 'null'::jsonb; end if;
  if p_operation = 'attempt' then
    if r.attempt_window + interval '1 minute' <= n then
      r.attempt_window := n; r.attempt_count := 0;
    end if;
    update public.lyric_sync_sessions set attempt_window = r.attempt_window,
      attempt_count = least(r.attempt_count + 1, 6) where show_id = show_uuid;
    return to_jsonb(r.attempt_count < 5);
  elsif p_operation = 'start' then
    -- All competing requests lock the SAME show row; no process-local ownership.
    if r.session_id is not null and r.revoked_at is null and r.expires_at > n then return 'null'::jsonb; end if;
    state_value := jsonb_build_object('version', 1, 'type', 'lyric_state', 'showId', show_uuid,
      'publisherId', (p_input->>'publisherId')::uuid, 'publisherSessionId', (p_input->>'sessionId')::uuid,
      'viewerSessionId', (p_input->>'sessionId')::uuid, 'sequence', 0, 'state', 'closed',
      'setlistEntryId', null, 'lyricsRevision', null, 'position', null);
    update public.lyric_sync_sessions set session_id = (p_input->>'sessionId')::uuid,
      publisher_id = (p_input->>'publisherId')::uuid, proof_hash = p_input->>'proofHash',
      created_at = n, expires_at = n + interval '5 minutes', revoked_at = null,
      latest_sequence = 0, latest_state = state_value, last_update_id = null where show_id = show_uuid returning * into r;
  else
    if r.session_id is null or r.revoked_at is not null or r.expires_at <= n then
      if p_operation = 'revoke' then return 'false'::jsonb; end if;
      return 'null'::jsonb;
    end if;
    if p_operation <> 'snapshot' then
      if r.session_id is distinct from (p_input->>'sessionId')::uuid
        or r.proof_hash is distinct from p_input->>'proofHash' then
        if p_operation = 'revoke' then return 'false'::jsonb; end if;
        return 'null'::jsonb;
      end if;
    end if;
    if p_operation = 'renew' then
      update public.lyric_sync_sessions set expires_at = least(n + interval '5 minutes', created_at + interval '12 hours')
        where show_id = show_uuid returning * into r;
    elsif p_operation = 'revoke' then
      update public.lyric_sync_sessions set revoked_at = n where show_id = show_uuid;
      return 'true'::jsonb;
    elsif p_operation = 'publish' then
      state_value := p_input->'state';
      -- The server also runs the strict Phase 3A parser. Fail closed at the SQL
      -- boundary on malformed shape, mismatched authority, or sensitive extras.
      if state_value is null or jsonb_typeof(state_value) <> 'object'
        or (select count(*) from jsonb_object_keys(state_value)) <> 11
        or not (state_value ?& array['version','type','showId','publisherId','publisherSessionId',
          'viewerSessionId','sequence','state','setlistEntryId','lyricsRevision','position']) then
        raise exception 'Invalid lyric state';
      end if;
      if state_value->>'version' is distinct from '1' or state_value->>'type' is distinct from 'lyric_state'
        or state_value->>'showId' is distinct from show_uuid::text
        or state_value->>'publisherId' is distinct from r.publisher_id::text
        or state_value->>'publisherSessionId' is distinct from r.session_id::text
        or coalesce(state_value->>'viewerSessionId', '') !~ '^[A-Za-z0-9_-]{1,128}$'
        or coalesce(state_value->>'state', '') not in ('open','closed','calibrating') then raise exception 'Invalid lyric state'; end if;
      if state_value->>'state' = 'closed' then
        if state_value->'position' <> 'null'::jsonb or state_value->'setlistEntryId' <> 'null'::jsonb
          or state_value->'lyricsRevision' <> 'null'::jsonb then raise exception 'Invalid lyric state'; end if;
      else
        if coalesce(state_value->>'setlistEntryId','') !~ '^[A-Za-z0-9_-]{1,128}$'
          or coalesce(state_value->>'lyricsRevision','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid lyric state'; end if;
        if not exists (select 1 from public.setlist_entries where id = (state_value->>'setlistEntryId')::uuid
          and show_id = show_uuid) then raise exception 'Invalid lyric song scope'; end if;
        if state_value->'position' <> 'null'::jsonb then
          if jsonb_typeof(state_value->'position') <> 'object' then raise exception 'Invalid lyric position'; end if;
          if (select count(*) from jsonb_object_keys(state_value->'position')) <> 3
            or not ((state_value->'position') ?& array['section','originalLine','characterOffset'])
            or coalesce(state_value#>>'{position,section}','') !~ '^[1-9][0-9]{0,14}$'
            or coalesce(state_value#>>'{position,originalLine}','') !~ '^(0|[1-9][0-9]{0,14})$'
            or coalesce(state_value#>>'{position,characterOffset}','') !~ '^(0|[1-9][0-9]{0,14})$' then raise exception 'Invalid lyric position'; end if;
        end if;
      end if;
      if p_input->>'requestId' is null or p_input->>'expectedSequence' is null
        or (p_input->>'expectedSequence')::bigint < 0 then raise exception 'Invalid lyric delivery'; end if;
      if r.last_update_id = (p_input->>'requestId')::uuid then
        if (r.latest_state - 'sequence') is distinct from (state_value - 'sequence') then raise exception 'Conflicting lyric retry'; end if;
        -- Retry the SAME saved update without advancing its sequence.
        return jsonb_build_object('sessionId', r.session_id, 'expiresAt', floor(extract(epoch from r.expires_at)*1000), 'state', r.latest_state);
      end if;
      if r.latest_sequence <> (p_input->>'expectedSequence')::bigint then return 'null'::jsonb; end if;
      if r.latest_sequence >= 9007199254740991 then raise exception 'Lyric session exhausted'; end if;
      state_value := jsonb_set(state_value, '{sequence}', to_jsonb(r.latest_sequence + 1));
      update public.lyric_sync_sessions set latest_sequence = latest_sequence + 1,
        latest_state = state_value, last_update_id = (p_input->>'requestId')::uuid where show_id = show_uuid returning * into r;
    elsif p_operation not in ('snapshot','status') then raise exception 'Invalid lyric operation'; end if;
  end if;
  return jsonb_build_object('sessionId', r.session_id, 'expiresAt', floor(extract(epoch from r.expires_at)*1000), 'state', r.latest_state);
end;
$$;
revoke all on function public.lyric_sync_registry(text, jsonb) from public, anon, authenticated;
grant execute on function public.lyric_sync_registry(text, jsonb) to service_role;
-- No existing policies, tables, publications, or channels are changed.
commit;

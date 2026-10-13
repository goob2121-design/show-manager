import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

// Always create our own disposable cluster. Never accept a database URL.
const bin = process.env.STAGEFLOW_TEST_PG_BIN || "C:/Program Files/PostgreSQL/18/bin";
const executable = (name) => path.join(bin, process.platform === "win32" ? `${name}.exe` : name);
const migration = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

test("real PostgreSQL guards ingestion allowances and preserves explicit admin limits", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "stageflow-child-ingestion-"));
  const data = path.join(root, "data");
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  let started = false;
  function run(name, args, input) {
    const result = spawnSync(executable(name), args, { input, encoding: "utf8", timeout: 60000, windowsHide: true });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, `${name}: ${result.stderr}\n${result.stdout}`);
    return result.stdout;
  }
  function sql(source) {
    if (process.env.STAGEFLOW_TEST_PGLITE_MODULE) {
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
        import { readFileSync } from 'node:fs';
        const { PGlite } = await import(process.env.STAGEFLOW_TEST_PGLITE_MODULE);
        const db = new PGlite(process.argv[1]);
        try { await db.exec(readFileSync(0, 'utf8')); }
        finally { await db.close(); }
      `, path.join(root, "pglite")], { input: source, encoding: "utf8", timeout: 60000, windowsHide: true });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    }
    return run("psql", ["-X", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], source);
  }
  try {
    if (!process.env.STAGEFLOW_TEST_PGLITE_MODULE) {
      run("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"]);
      run("pg_ctl", ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
      started = true;
    }
    sql(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create table public.show_comp_tickets (
        id uuid primary key, show_id uuid, ticket_type text,
        ticket_count integer default 1, checked_in_count integer default 0, checked_in boolean default false
      );
      create table public.show_reserved_seating_links (
        id uuid primary key default gen_random_uuid(), show_id uuid, source_ticket_id uuid,
        customer_name text, email text, ticket_count integer default 1,
        is_complimentary boolean default false, seat_category text default 'paid_reserved',
        selection_token text default gen_random_uuid()::text, scan_token text,
        submitted_at timestamptz, selection_mode text
      );
      create table public.show_reserved_seat_assignments (
        id uuid primary key default gen_random_uuid(), show_id uuid, seating_link_id uuid,
        customer_name text, email text, seat_id text, section text, row_label text,
        seat_number integer, assignment_type text, seat_category text, notes text,
        unique(show_id, seat_id)
      );
      create table public.show_admission_projection_sources (
        show_id uuid, source_type text, source_id uuid, projected_ticket_id uuid
      );
      grant select, insert, update, delete on all tables in schema public to service_role;
      alter table public.show_reserved_seating_links enable row level security;
      alter table public.show_reserved_seat_assignments enable row level security;
    `);
    sql(migration("20261012_add_reserved_child_seats.sql"));
    // Existing low values predate the new audit marker and must be preserved.
    sql(`insert into public.show_reserved_seating_links (id, child_seat_limit)
      values ('00000000-0000-0000-0000-000000000010', 1);`);
    sql(migration("20261014_guard_square_child_allowance_initialization.sql"));
    sql(migration("20261013_secure_reserved_seating_access.sql"));
    sql(`
      do $$ begin
        if not (select child_seat_limit_admin_override from public.show_reserved_seating_links
          where id = '00000000-0000-0000-0000-000000000010') then
          raise exception 'Historical low limit was not protected';
        end if;
        if has_function_privilege('anon', 'public.initialize_reserved_child_seat_allowance(uuid,uuid)', 'execute')
          or has_function_privilege('authenticated', 'public.initialize_reserved_child_seat_allowance(uuid,uuid)', 'execute') then
          raise exception 'Browser role can execute initializer';
        end if;
      end $$;
      set role service_role;
      insert into public.show_comp_tickets (id, show_id, ticket_type) values
        ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000100', 'paid_online'),
        ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000100', 'guest_comp');
      insert into public.show_reserved_seating_links (id, show_id, source_ticket_id, child_seat_limit) values
        ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 0),
        ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 3),
        ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 0),
        ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000002', 0),
        ('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 0),
        ('00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000100', null, 0);
      insert into public.show_admission_projection_sources values
        ('00000000-0000-0000-0000-000000000100', 'reserved_link', '00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000001');
      update public.show_reserved_seating_links set scan_token = 'stable-scan-token', ticket_count = 4
      where id = '00000000-0000-0000-0000-000000000011';
      insert into public.show_reserved_seat_assignments (show_id, seating_link_id, seat_id, assignment_type)
      values ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000011', 'L-A1', 'customer');
      do $$ declare s uuid := '00000000-0000-0000-0000-000000000100'; r record; n integer;
      begin
        -- Reproduce the original failure, using the actual Phase 1 trigger.
        begin
          update public.show_reserved_seating_links set child_seat_limit = 3
          where id = '00000000-0000-0000-0000-000000000011';
          raise exception 'UNEXPECTED_DIRECT_UPDATE';
        exception when raise_exception then
          if sqlerrm <> 'Child-seat counts must be changed through the guarded API.' then raise; end if;
        end;
        select * into r from public.initialize_reserved_child_seat_allowance(s, '00000000-0000-0000-0000-000000000011');
        if r.result_status <> 'INITIALIZED' or r.child_seat_limit <> 3 then raise exception 'Initialization failed'; end if;
        select * into r from public.initialize_reserved_child_seat_allowance(s, '00000000-0000-0000-0000-000000000011');
        if r.result_status <> 'PRESERVED' then raise exception 'Initialization not idempotent'; end if;
        -- Guard permission must not leak to a later direct update in this transaction.
        begin
          update public.show_reserved_seating_links set child_seat_limit = 9
          where id = '00000000-0000-0000-0000-000000000011';
          raise exception 'UNEXPECTED_GUARD_LEAK';
        exception when raise_exception then
          if sqlerrm <> 'Child-seat counts must be changed through the guarded API.' then raise; end if;
        end;
        foreach n in array array[0,1,2,7] loop
          perform public.set_reserved_child_seat_limit(s, '00000000-0000-0000-0000-000000000012', n);
          select * into r from public.initialize_reserved_child_seat_allowance(s, '00000000-0000-0000-0000-000000000012');
          if r.result_status <> 'PRESERVED' or r.child_seat_limit <> n then raise exception 'Admin limit overwritten: %', n; end if;
        end loop;
        -- Saving an unchanged zero still records an explicit admin choice.
        perform public.set_reserved_child_seat_limit(s, '00000000-0000-0000-0000-000000000013', 0);
        select * into r from public.initialize_reserved_child_seat_allowance(s, '00000000-0000-0000-0000-000000000013');
        if r.child_seat_limit <> 0 or r.result_status <> 'PRESERVED' then raise exception 'Explicit zero overwritten'; end if;
        select * into r from public.initialize_reserved_child_seat_allowance(s, '00000000-0000-0000-0000-000000000014');
        if r.result_status <> 'NOT_ELIGIBLE' then raise exception 'Nonpaid ticket allowed'; end if;
        select * into r from public.initialize_reserved_child_seat_allowance('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000015');
        if r.result_status <> 'NOT_ELIGIBLE' then raise exception 'Cross-show ticket allowed'; end if;
        select * into r from public.initialize_reserved_child_seat_allowance(s, '00000000-0000-0000-0000-000000000016');
        if r.result_status <> 'INITIALIZED' then raise exception 'Projected ticket not resolved'; end if;
        update public.show_reserved_seating_links set customer_name = 'Normal sync still works'
        where id = '00000000-0000-0000-0000-000000000011';
        if not exists (select 1 from public.show_reserved_seating_links
          where id = '00000000-0000-0000-0000-000000000011'
            and ticket_count = 4 and scan_token = 'stable-scan-token')
          or not exists (select 1 from public.show_reserved_seat_assignments
            where seating_link_id = '00000000-0000-0000-0000-000000000011' and seat_id = 'L-A1') then
          raise exception 'Allowance initialization changed reservation data or seats';
        end if;
      end $$;
    `);
  } finally {
    if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(root, { recursive: true, force: true });
  }
});

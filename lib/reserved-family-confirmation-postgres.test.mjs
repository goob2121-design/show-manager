import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import test from 'node:test';

// No database URL is accepted: tests own a disposable local database exclusively.
const fixture = `
create role anon; create role authenticated; create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create table public.show_comp_tickets (id uuid primary key, show_id uuid, ticket_type text,
 ticket_count integer default 2, checked_in_count integer default 0, checked_in boolean default false);
create table public.show_reserved_seating_links (id uuid primary key default gen_random_uuid(),
 show_id uuid, source_ticket_id uuid, customer_name text, email text, ticket_count integer default 2,
 is_complimentary boolean default false, seat_category text default 'paid_reserved',
 selection_token text unique, scan_token text default 'preserved-barcode', submitted_at timestamptz,
 sent_at timestamptz, selection_mode text);
create table public.show_reserved_seat_assignments (id uuid primary key default gen_random_uuid(),
 show_id uuid, seating_link_id uuid, customer_name text, email text, seat_id text, section text,
 row_label text, seat_number integer, assignment_type text, seat_category text, notes text,
 unique(show_id, seat_id));
create table public.show_admission_projection_sources (show_id uuid, source_type text,
 source_id uuid, projected_ticket_id uuid);
grant select, insert, update, delete on all tables in schema public to service_role;
alter table public.show_reserved_seating_links enable row level security;
alter table public.show_reserved_seat_assignments enable row level security;
`;
const migration = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const migrations = ['20261012_add_reserved_child_seats.sql',
 '20261014_guard_square_child_allowance_initialization.sql',
 '20261013_secure_reserved_seating_access.sql', '20261015_confirm_reserved_family_seats.sql'];
const show = '00000000-0000-0000-0000-000000000100';
const seed = `set role service_role;
insert into public.show_comp_tickets (id, show_id, ticket_type)
 select ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, '${show}', 'paid_online'
 from generate_series(1,20) n;
insert into public.show_reserved_seating_links (show_id, source_ticket_id, selection_token, child_seat_limit)
 select '${show}', id, 'family-' || row_number() over(order by id), 3 from public.show_comp_tickets;
reset role;`;
const call = (token, paid, child = []) => `select * from public.confirm_reserved_family_seats('${token}',
 array[${paid.map(s => `'${s}'`).join(',')}]::text[], array[${child.map(s => `'${s}'`).join(',')}]::text[])`;
const legacyCall = (token, paid) => `select * from public.confirm_reserved_seats('${token}',
 array[${paid.map(s => `'${s}'`).join(',')}]::text[])`;
const status = (query, expected) => `do $$ declare r record; begin
 select * into r from (${query}) result;
 if r.result_status <> '${expected}' then raise exception 'Expected ${expected}, got %', r.result_status; end if;
end $$;`;

test('initial family confirmation executes real migrations, triggers and permissions', async t => {
 assert.ok(process.env.STAGEFLOW_TEST_PGLITE_MODULE, 'Set STAGEFLOW_TEST_PGLITE_MODULE to an isolated PGlite module');
 const { PGlite } = await import(process.env.STAGEFLOW_TEST_PGLITE_MODULE);
 const db = new PGlite();
 try {
  await db.exec(fixture);
  for (const name of migrations) await db.exec(migration(name));
  await db.exec(seed);
  const run = sql => db.exec(`set role service_role; ${sql}; reset role;`);
  await t.test('service-role only execution', async () => {
   const { rows } = await db.query(`select has_function_privilege('anon', 'public.confirm_reserved_family_seats(text,text[],text[])','execute') a,
    has_function_privilege('authenticated', 'public.confirm_reserved_family_seats(text,text[],text[])','execute') b,
    has_function_privilege('service_role', 'public.confirm_reserved_family_seats(text,text[],text[])','execute') c`);
   assert.deepEqual(rows[0], { a: false, b: false, c: true });
   const legacy = await db.query(`select has_function_privilege('anon', 'public.confirm_reserved_seats(text,text[])','execute') a,
    has_function_privilege('authenticated', 'public.confirm_reserved_seats(text,text[])','execute') b,
    has_function_privilege('service_role', 'public.confirm_reserved_seats(text,text[])','execute') c`);
   assert.deepEqual(legacy.rows[0], { a: false, b: false, c: true });
   await assert.rejects(db.exec(`set role anon; ${call('family-1',['L-A1','L-A2'])}`), /permission denied/);
   await db.exec('reset role');
  });
  await t.test('atomic paid plus three children, barcode and quantities preserved', async () => {
   await run(status(call('family-1',['L-A1','L-A2'],['L-A3','L-A4','L-A5']), 'CONFIRMED'));
   const { rows } = await db.query(`select ticket_count, scan_token, submitted_at is not null confirmed,
    (select count(*)::int from public.show_reserved_seat_assignments where seating_link_id=l.id) occupied
    from public.show_reserved_seating_links l where selection_token='family-1'`);
   assert.deepEqual(rows[0], { ticket_count: 2, scan_token: 'preserved-barcode', confirmed: true, occupied: 5 });
   await assert.rejects(run(`insert into public.show_reserved_seat_assignments (occupant_type) values ('child_free')`), /guarded API/);
   await db.exec('reset role');
  });
  await t.test('identical retry preserves assignment IDs; different submission cannot overwrite', async () => {
   const before = await db.query('select id from public.show_reserved_seat_assignments order by id');
   await run(status(call('family-1',['L-A2','L-A1'],['L-A5','L-A3','L-A4']), 'ALREADY_CONFIRMED'));
   await run(status(call('family-1',['R-A1','R-A2']), 'ALREADY_SUBMITTED'));
   assert.deepEqual((await db.query('select id from public.show_reserved_seat_assignments order by id')).rows, before.rows);
  });
  await t.test('approved reduced allowance, paid quantity and duplicate seat validation', async () => {
   await run(`select public.set_reserved_child_seat_limit('${show}', id, 0) from public.show_reserved_seating_links where selection_token='family-2';`);
   await run(status(call('family-2',['L-B1','L-B2'],['L-B3']), 'CHILD_LIMIT_EXCEEDED'));
   await run(status(call('family-2',['L-B1']), 'PAID_SEAT_COUNT_MISMATCH'));
   await run(status(call('family-2',['L-B1','L-B1']), 'DUPLICATE_SEAT'));
   await run(status(call('family-2',['L-B1','L-B2']), 'CONFIRMED'));
  });
  await t.test('occupied and blocked seats leave no partial reservation', async () => {
   await run(`insert into public.show_reserved_seat_assignments (show_id, seat_id, assignment_type) values ('${show}','L-C3','blocked');`);
   await run(status(call('family-3',['L-C1','L-C2'],['L-C3']), 'SEAT_CONFLICT'));
   await run(status(call('family-3',['L-C1','L-A1']), 'SEAT_CONFLICT'));
   const { rows } = await db.query(`select submitted_at, (select count(*)::int from public.show_reserved_seat_assignments where seating_link_id=l.id) seats
    from public.show_reserved_seating_links l where selection_token='family-3'`);
   assert.deepEqual(rows[0], { submitted_at: null, seats: 0 });
  });
  await t.test('check-in, invalid token, invalid seat and complimentary restrictions', async () => {
   await run(`update public.show_comp_tickets set checked_in=true where id=(select source_ticket_id from public.show_reserved_seating_links where selection_token='family-4');`);
   await run(status(call('family-4',['L-D1','L-D2']), 'ALREADY_CHECKED_IN'));
   await run(status(call('missing',['L-D1','L-D2']), 'NOT_FOUND'));
   await run(status(call('family-5',['L-D1','INVALID']), 'INVALID_SEAT'));
   await run(`update public.show_reserved_seating_links set is_complimentary=true where selection_token='family-5';`);
   await run(status(call('family-5',['L-D1','L-D2']), 'NOT_ELIGIBLE'));
  });
  await t.test('later child-seat editing still works', async () => {
   await run(status(`select * from public.replace_reserved_family_seats('family-1', array['L-A1','L-A2'], array['L-A3','L-A4','L-A6'])`, 'UPDATED'));
   await run(status(`select * from public.replace_reserved_family_seats('family-1', array['L-A1','L-A2'], array['L-A3','L-A4','L-C3'])`, 'SEAT_CONFLICT'));
   const { rows } = await db.query(`select seat_id from public.show_reserved_seat_assignments
    where seating_link_id=(select id from public.show_reserved_seating_links where selection_token='family-1') order by seat_id`);
   assert.deepEqual(rows.map(row => row.seat_id), ['L-A1','L-A2','L-A3','L-A4','L-A6']);
  });
  await t.test('legacy comp and partial paid-only confirmation remain compatible and idempotent', async () => {
   await run(`update public.show_reserved_seating_links set is_complimentary=true,seat_category='comp' where selection_token='family-10';`);
   await run(status(legacyCall('family-10',['R-I1']), 'CONFIRMED'));
   await run(status(legacyCall('family-10',['R-I1']), 'ALREADY_CONFIRMED'));
   await run(status(call('family-10',['R-I1','R-I2']), 'NOT_ELIGIBLE'));
   await run(status(legacyCall('family-11',['R-J1']), 'CONFIRMED'));
   await run(status(legacyCall('family-11',['R-J2']), 'ALREADY_SUBMITTED'));
   const { rows } = await db.query(`select seat_category,occupant_type from public.show_reserved_seat_assignments where seat_id='R-I1'`);
   assert.deepEqual(rows[0], { seat_category: 'comp', occupant_type: 'ticketed' });
  });
  await t.test('unique-conflict during insertion rolls back all seats and confirmation', async () => {
   await db.exec(`create function public.test_conflict() returns trigger language plpgsql as $$ begin
    if new.seat_id='L-E3' then raise unique_violation; end if; return new; end $$;
    create trigger test_conflict before insert on public.show_reserved_seat_assignments
    for each row execute function public.test_conflict();`);
   await run(status(call('family-6',['L-E1','L-E2'],['L-E3']), 'SEAT_CONFLICT'));
   const { rows } = await db.query(`select submitted_at, (select count(*)::int from public.show_reserved_seat_assignments where seating_link_id=l.id) seats
    from public.show_reserved_seating_links l where selection_token='family-6'`);
   assert.deepEqual(rows[0], { submitted_at: null, seats: 0 });
   await db.exec('drop trigger test_conflict on public.show_reserved_seat_assignments; drop function public.test_conflict();');
  });
  await t.test('projected paid ticket supported, cross-show ticket rejected, partial legacy seats preserved', async () => {
   await run(`insert into public.show_admission_projection_sources
    select show_id, 'reserved_link', id, source_ticket_id from public.show_reserved_seating_links where selection_token='family-7';
    update public.show_reserved_seating_links set source_ticket_id=null where selection_token='family-7';`);
   await run(status(call('family-7',['R-F1','R-F2']), 'CONFIRMED'));
   await run(status(`select * from public.replace_reserved_family_seats('family-7', array['R-F1','R-F2'], array['R-F3'])`, 'UPDATED'));
   await run(`update public.show_comp_tickets set show_id=gen_random_uuid() where id=(select source_ticket_id from public.show_reserved_seating_links where selection_token='family-8');`);
   await run(status(call('family-8',['R-G1','R-G2']), 'NOT_ELIGIBLE'));
   await run(`insert into public.show_reserved_seat_assignments (show_id,seating_link_id,seat_id,assignment_type)
    select show_id,id,'R-H1','customer' from public.show_reserved_seating_links where selection_token='family-9';`);
   await run(status(call('family-9',['R-H1','R-H2']), 'EXISTING_ASSIGNMENTS'));
  });
 } finally { await db.close(); }
});

// True concurrent sessions require native PostgreSQL; PGlite has a single connection.
test('native PostgreSQL concurrent confirmations serialize and seat races roll back',
 { skip: !process.env.STAGEFLOW_TEST_PG_BIN }, async () => {
 const root = mkdtempSync(path.join(tmpdir(), 'stageflow-family-concurrency-'));
 const bin = process.env.STAGEFLOW_TEST_PG_BIN;
 const exe = name => path.join(bin, process.platform === 'win32' ? `${name}.exe` : name);
 const server = createServer();
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const port = server.address().port;
 await new Promise(resolve => server.close(resolve));
 const args = ['-X','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'];
 const sync = (name, argv, input) => {
  const r = spawnSync(exe(name), argv, { input, encoding:'utf8', windowsHide:true, timeout:60000,
   stdio: name === 'pg_ctl' ? 'ignore' : 'pipe' });
  assert.equal(r.error, undefined, r.error?.message);
  assert.equal(r.status,0,r.stderr); return r.stdout;
 };
 const sql = source => sync('psql',args,source);
 const session = source => new Promise((resolve,reject) => {
  const p = spawn(exe('psql'),args,{windowsHide:true}); let out='', err='';
  p.stdout.on('data',d=>out+=d); p.stderr.on('data',d=>err+=d);
  p.on('error',reject); p.on('close',code=>code===0 ? resolve(out) : reject(new Error(err)));
  p.stdin.end(source);
 });
 let started=false;
 try {
  sync('initdb',['-D',root,'-U','postgres','-A','trust','--no-locale','--encoding=UTF8']);
  started=true;
  sync('pg_ctl',['-D',root,'-l',path.join(root,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);
  sql(fixture); for(const name of migrations) sql(migration(name)); sql(seed);
  // Hold the reservation lock in one session while both confirmation calls queue.
  const lock = session(`set application_name='family-test-lock'; begin; select id from public.show_reserved_seating_links where selection_token='family-1' for update; select pg_sleep(2); commit;`);
  let locked=false;
  for(let attempt=0; attempt<50; attempt++) {
   if(sql(`select exists(select 1 from pg_stat_activity where application_name='family-test-lock' and wait_event='PgSleep');`).trim()==='t') { locked=true; break; }
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.ok(locked, 'Lock-holder session did not reach its synchronization point');
  const duplicate = await Promise.all([session(`set role service_role; ${call('family-1',['L-A1','L-A2'],['L-A3'])};`),
    session(`set role service_role; ${call('family-1',['L-A1','L-A2'],['L-A3'])};`)]);
  await lock;
  assert.equal(duplicate.filter(s=>s.includes('ALREADY_CONFIRMED')).length,1);
  assert.equal(duplicate.filter(s=>s.split('\n').some(line=>line.startsWith('CONFIRMED|'))).length,1);
  const alternatives = await Promise.all([
   session(`set role service_role; ${call('family-4',['R-A1','R-A2'])};`),
   session(`set role service_role; ${call('family-4',['R-A3','R-A4'])};`)]);
  assert.equal(alternatives.filter(s=>s.includes('ALREADY_SUBMITTED')).length,1);
  assert.equal(sql(`select count(*) from public.show_reserved_seat_assignments where seat_id like 'R-A%';`).trim(),'2');
  const races = await Promise.all([session(`set role service_role; ${call('family-2',['L-B1','L-B2'],['L-B3'])};`),
    session(`set role service_role; ${call('family-3',['L-B1','L-B4'],['L-B5'])};`)]);
  assert.equal(races.filter(s=>s.includes('SEAT_CONFLICT')).length,1);
  assert.equal(sql(`select count(*) from public.show_reserved_seat_assignments where seat_id like 'L-B%';`).trim(),'3');
  assert.equal(sql(`select count(*) from public.show_reserved_seating_links where selection_token in ('family-2','family-3') and submitted_at is not null;`).trim(),'1');
  // Hold the winner's transaction open so the other submission must wait for it.
  for (const legacyFirst of [true, false]) {
   const token = legacyFirst ? 'family-10' : 'family-11';
   const paid = legacyFirst ? ['R-I1','R-I2'] : ['R-J1','R-J2'];
   const children = legacyFirst ? ['R-I3'] : ['R-J3'];
   const first = legacyFirst ? legacyCall(token, paid) : call(token, paid, children);
   const second = legacyFirst ? call(token, paid, children) : legacyCall(token, paid);
   const winner = session(`set application_name='mixed-confirmation'; set role service_role; begin; ${first}; select pg_sleep(1); commit;`);
   let waiting = false;
   for (let attempt = 0; attempt < 50; attempt++) {
    if (sql(`select exists(select 1 from pg_stat_activity where application_name='mixed-confirmation' and wait_event='PgSleep');`).trim() === 't') { waiting = true; break; }
    await new Promise(resolve => setTimeout(resolve,20));
   }
   assert.ok(waiting, 'Mixed-path winner did not hold the reservation lock');
   const loser = session(`set role service_role; ${second};`);
   const results = await Promise.all([winner, loser]);
   assert.match(results[0], /CONFIRMED\|/);
   assert.match(results[1], /ALREADY_SUBMITTED\|/);
   assert.equal(sql(`select count(*) from public.show_reserved_seat_assignments where seating_link_id=(select id from public.show_reserved_seating_links where selection_token='${token}');`).trim(), legacyFirst ? '2' : '3');
  }
  const mixedDuplicates = await Promise.all([
   session(`set role service_role; ${legacyCall('family-12',['L-J1','L-J2'])};`),
   session(`set role service_role; ${call('family-12',['L-J1','L-J2'])};`),
   session(`set role service_role; ${legacyCall('family-12',['L-J1','L-J2'])};`)]);
  assert.equal(mixedDuplicates.filter(s=>s.split('\n').some(line=>line.startsWith('CONFIRMED|'))).length,1);
  assert.equal(mixedDuplicates.filter(s=>s.includes('ALREADY_CONFIRMED')).length,2);
  assert.equal(sql(`select count(*) from public.show_reserved_seat_assignments where seat_id in ('L-J1','L-J2');`).trim(),'2');
 } finally {
  if(started) sync('pg_ctl',['-D',root,'-m','immediate','-w','stop']);
  assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep));
  rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
});

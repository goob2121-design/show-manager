import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(name, modules = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(`./${name}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Buffer, URL, TextEncoder, TextDecoder, Request, Response, Error, SyntaxError, AbortSignal,
    setInterval, clearInterval, setTimeout, clearTimeout, atob, crypto: webcrypto,
    require: name => name === "server-only" ? {} : modules[name] ?? require(name) });
  return exports;
}
const protocol = load("lyric-follow-protocol");
const messages = load("lyric-sync-messages", { "./lyric-follow-protocol": protocol });
const adapter = load("lyric-sync-store", { "./lyric-follow-protocol": protocol });
const server = load("lyric-sync-server", { "./lyric-follow-protocol": protocol, "./lyric-sync-store": adapter, "./lyric-sync-messages": messages });
const http = load("lyric-sync-http", { "./lyric-sync-server": server, "./lyric-sync-store": adapter });
const runtime = load("lyric-sync-runtime", { "@supabase/supabase-js": { createClient() { throw Error("No real transport in tests"); } },
  "./lyric-sync-server": server, "./lyric-sync-store": adapter });
const client = load("lyric-sync-client", { "@supabase/supabase-js": {}, "./lyric-follow-protocol": protocol, "./lyric-sync-messages": messages });
const keys = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const config = { pin: "654321", cookieSecret: "local-cookie-test-secret-".repeat(3),
  privateKey: await webcrypto.subtle.exportKey("jwk", keys.privateKey), origin: "https://stageflow.example" };
const show = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const revision = "a".repeat(64);
const open = { viewerSessionId: "viewer-one", state: "open", setlistEntryId: "entry-one", lyricsRevision: revision,
  position: { section: 2, originalLine: 3, characterOffset: 0 } };
// Test-only synchronous contract model. NOT a deployment store and NOT proof
// of PostgreSQL concurrency, transaction rollback, RLS, or role privileges.
function model() {
  const rows = new Map(); let now = Date.now();
  const active = row => row?.sessionId && !row.revoked && row.expiresAt > now;
  const store = { async run(operation, input) {
    let row = rows.get(input.showId);
    if (operation === "attempt") {
      if (!row) { row = { attempts: 0, window: now }; rows.set(input.showId, row); }
      if (row.window + 60_000 <= now) { row.attempts = 0; row.window = now; }
      return ++row.attempts <= 5;
    }
    if (!row) return null;
    if (operation === "start") {
      if (active(row)) return null;
      Object.assign(row, { sessionId: input.sessionId, publisherId: input.publisherId, proofHash: input.proofHash,
        createdAt: now, expiresAt: now + 300_000, revoked: false, state: { version: 1, type: "lyric_state", showId: input.showId,
          publisherId: input.publisherId, publisherSessionId: input.sessionId, viewerSessionId: input.sessionId,
          sequence: 0, state: "closed", setlistEntryId: null, lyricsRevision: null, position: null } });
    } else {
      if (!active(row)) return operation === "revoke" ? false : null;
      if (operation !== "snapshot" && (input.sessionId !== row.sessionId || input.proofHash !== row.proofHash)) return null;
      if (operation === "revoke") { row.revoked = true; return true; }
      if (operation === "renew") row.expiresAt = Math.min(now + 300_000, row.createdAt + 43_200_000);
      if (operation === "publish") {
        if (row.lastRequest === input.requestId) {
          const prior = { ...row.state }; delete prior.sequence;
          const next = { ...input.state }; delete next.sequence;
          if (JSON.stringify(prior) !== JSON.stringify(next)) throw Error("Conflicting lyric retry");
        } else {
          if (input.expectedSequence !== row.state.sequence) return null;
          row.state = { ...input.state, sequence: row.state.sequence + 1 }; row.lastRequest = input.requestId;
        }
      }
    }
    return { sessionId: row.sessionId, expiresAt: row.expiresAt, state: row.state };
  } };
  return { store, rows, advance: ms => { now += ms; } };
}
async function fixture(relay) {
  const db = model(), sent = [];
  const service = await server.createLyricSyncService(config, db.store, relay ?? { async send(topic, message) { sent.push({ topic, message }); } });
  return { db, service, sent };
}
const start = service => service.start(show, config.pin, config.origin);
const cursor = envelope => {
  const state = JSON.parse(envelope.payload).state;
  return protocol.createLyricStateCursor({ showId: state.showId, publisherId: state.publisherId, publisherSessionId: state.publisherSessionId });
};

test("configuration fails closed; no public/admin PIN fallback", async () => {
  for (const changed of [{ pin: "" }, { cookieSecret: "" }, { privateKey: {} }, { origin: "http://stageflow.example" }]) {
    await assert.rejects(server.createLyricSyncService({ ...config, ...changed }, model().store));
  }
});
test("correct PIN creates a hashed-proof session and secure cookie", async () => {
  const { service, db } = await fixture(); const result = await start(service);
  assert.equal(result.cookieOptions.httpOnly, true); assert.equal(result.cookieOptions.secure, true);
  assert.equal(result.cookieOptions.sameSite, "strict");
  const cookieData = JSON.parse(Buffer.from(result.cookie.split(".")[0], "base64url"));
  assert.notEqual(db.rows.get(show).proofHash, cookieData.proof);
  assert.match(db.rows.get(show).proofHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify([...db.rows.values()]).includes(cookieData.proof), false);
});
test("wrong PIN consumes persistent attempts; sixth request rejected", async () => {
  const { service, db } = await fixture();
  for (let i = 0; i < 5; i++) await assert.rejects(service.start(show, "000000", config.origin), /PIN/);
  await assert.rejects(start(service), /later/);
  assert.equal(db.rows.get(show).sessionId, undefined);
  db.advance(60_001); assert.ok((await start(service)).cookie);
});
test("wrong origin is rejected before accessing the session store", async () => {
  let calls = 0;
  const service = await server.createLyricSyncService(config, { async run() { calls++; throw Error(); } });
  await assert.rejects(service.start(show, config.pin, "https://other.example")); assert.equal(calls, 0);
});
test("competing leader attempts: contract model accepts exactly one, no takeover", async () => {
  const { service, db } = await fixture();
  const results = await Promise.allSettled([start(service), start(service)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(db.rows.size, 1);
});
test("renewal extends active lease; expired or revoked owner cannot renew", async () => {
  const { service, db } = await fixture(); const result = await start(service);
  const original = db.rows.get(show).expiresAt; db.advance(60_000);
  await service.renew(show, result.cookie, config.origin); assert.ok(db.rows.get(show).expiresAt > original);
  assert.equal(await service.revoke(show, result.cookie, config.origin), true);
  await assert.rejects(service.renew(show, result.cookie, config.origin));
  const next = await start(service); db.advance(300_001);
  await assert.rejects(service.renew(show, next.cookie, config.origin));
  assert.equal(await service.snapshot(show), null);
});
test("cookie tampering and wrong-show relay rejected; no transport send", async () => {
  const { service, sent } = await fixture(); const result = await start(service);
  await assert.rejects(service.publish(show, `${result.cookie}x`, config.origin, open));
  await assert.rejects(service.publish(other, result.cookie, config.origin, open));
  assert.equal(sent.length, 0);
});
test("relay signs validated state with server sequence and no sensitive payloads", async () => {
  const { service, sent } = await fixture(); const result = await start(service);
  const message = await service.publish(show, result.cookie, config.origin, open);
  const value = JSON.parse(message.payload);
  assert.equal(value.state.sequence, 1); assert.equal(sent[0].topic, messages.lyricSyncTopic(show));
  assert.equal(await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, keys.publicKey,
    Buffer.from(message.signature, "base64url"), new TextEncoder().encode(message.payload)), true);
  assert.doesNotMatch(message.payload, /proof|cookie|pin|performanceFlow/);
  await assert.rejects(service.publish(show, result.cookie, config.origin, { ...open, lyrics: "sensitive" }));
  await assert.rejects(service.publish(show, result.cookie, config.origin, { ...open, sequence: 999 }));
});
test("browser verifier rejects tampering, wrong authority, expiry and malformed messages", async () => {
  const { service } = await fixture(); const result = await start(service);
  const message = await service.publish(show, result.cookie, config.origin, open);
  const publicKey = await messages.importLyricSyncPublicKey(service.publicKey), current = cursor(message);
  assert.equal((await messages.verifyLyricSyncMessage(message, publicKey, current, Date.now(), revision)).accepted, true);
  for (const bad of [{ ...message, payload: message.payload.replace("entry-one", "entry-two") },
    { ...message, signature: "a".repeat(86) }, {}, { ...message, extra: true }]) {
    assert.equal((await messages.verifyLyricSyncMessage(bad, publicKey, current)).accepted, false);
  }
  assert.equal((await messages.verifyLyricSyncMessage(message, publicKey, { ...current, authority: { ...current.authority, showId: other } })).accepted, false);
  assert.equal((await messages.verifyLyricSyncMessage(message, publicKey, { ...current, authority: { ...current.authority, publisherId: other } })).accepted, false);
  assert.equal((await messages.verifyLyricSyncMessage(message, publicKey, { ...current, authority: { ...current.authority, publisherSessionId: other } })).accepted, false);
  assert.equal((await messages.verifyLyricSyncMessage(message, publicKey, current, Date.now() + 61_000)).accepted, false);
});
test("duplicate, stale and conflicting snapshots cannot replace newer accepted position", async () => {
  const { service } = await fixture(); const result = await start(service);
  const first = await service.publish(show, result.cookie, config.origin, open);
  const second = await service.publish(show, result.cookie, config.origin, { ...open, position: { section: 1, originalLine: 0, characterOffset: 0 } }, { requestId: other, expectedSequence: 1 });
  const key = await messages.importLyricSyncPublicKey(service.publicKey);
  const accepted = await messages.verifyLyricSyncMessage(second, key, cursor(first), Date.now(), revision);
  assert.equal(accepted.accepted, true); assert.equal(accepted.message.position.section, 1, "backward positions accepted");
  assert.equal((await messages.verifyLyricSyncMessage(first, key, accepted.cursor)).reason, "out_of_order");
  assert.equal((await messages.verifyLyricSyncMessage(second, key, accepted.cursor)).reason, "duplicate_sequence");
  const snapshot = await service.snapshot(show);
  assert.equal((await messages.verifyLyricSyncMessage(snapshot, key, cursor(snapshot), Date.now(), revision)).accepted, true);
  assert.equal((await messages.verifyLyricSyncMessage(snapshot, key, accepted.cursor)).accepted, false);
});
test("relay failure is reported but saved snapshot remains recoverable", async () => {
  const { service } = await fixture({ async send() { throw Error("local transport unavailable"); } });
  const result = await start(service);
  await assert.rejects(service.publish(show, result.cookie, config.origin, open), /Broadcast/);
  assert.equal(JSON.parse((await service.snapshot(show)).payload).state.sequence, 1);
  await assert.rejects(server.blockedLyricSyncRelay.send());
});
test("manual and automatic closed state use same protocol; revoked snapshot unavailable", async () => {
  const { service } = await fixture(); const result = await start(service);
  await service.publish(show, result.cookie, config.origin, open);
  const closed = await service.publish(show, result.cookie, config.origin, { viewerSessionId: open.viewerSessionId,
    state: "closed", setlistEntryId: null, lyricsRevision: null, position: null }, { requestId: other, expectedSequence: 1 });
  assert.equal(JSON.parse(closed.payload).state.state, "closed");
  await service.revoke(show, result.cookie, config.origin); assert.equal(await service.snapshot(show), null);
});
test("RPC adapter allowlists fields and rejects malformed or conflicting results", async () => {
  let captured;
  const store = adapter.createLyricSyncStore(async (_operation, input) => { captured = input; return { data: true, error: null }; });
  await store.run("attempt", { showId: show, proof: "never-forward", cookie: "never-forward" });
  assert.deepEqual(Object.keys(captured), ["showId"]);
  const broken = adapter.createLyricSyncStore(async () => ({ data: { sessionId: other, expiresAt: 0, state: open }, error: null }));
  await assert.rejects(broken.run("snapshot", { showId: show }));
});
test("static SQL boundary: one table, parent lock, database clock, persistent attempts, server-only privileges", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261010_add_simple_lyric_sync.sql", import.meta.url), "utf8");
  assert.equal((sql.match(/create table /gi) ?? []).length, 1);
  assert.match(sql, /for update;\s+n := clock_timestamp/);
  assert.match(sql, /attempt_count = least\(r.attempt_count \+ 1, 6\)/);
  assert.match(sql, /latest_sequence = latest_sequence \+ 1/);
  assert.match(sql, /r.last_update_id = \(p_input->>'requestId'\)::uuid/);
  assert.match(sql, /r.latest_sequence <> \(p_input->>'expectedSequence'\)::bigint/);
  assert.match(sql, /from public\.setlist_entries where id =/);
  assert.match(sql, /jsonb_object_keys\(state_value\)\) <> 11/);
  assert.match(sql, /security invoker set search_path = ''/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.doesNotMatch(sql, /security definer|alter publication|create policy|update public\.live_show_state/i);
});

function request(action, value, cookieValue, origin = config.origin) {
  const read = ["snapshot", "status"].includes(action);
  return new Request(`https://stageflow.example/api/lyric-sync/${action}${read ? `?showId=${show}` : ""}`, {
    method: read ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}),
      ...(cookieValue ? { cookie: `${server.lyricSyncCookieName}=${cookieValue}` } : {}) },
    ...(read ? {} : { body: JSON.stringify(value) }),
  });
}
test("HTTP start sets only HttpOnly cookie; PIN limits, methods, origins, bodies and missing config fail closed", async () => {
  const { service } = await fixture(); const handler = http.createLyricSyncHttp(async () => service, () => config.origin);
  assert.equal((await handler(request("start", { showId: show, pin: "000000" }), "start")).status, 401);
  const response = await handler(request("start", { showId: show, pin: config.pin }), "start");
  assert.equal(response.status, 200); assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.equal((await response.json()).cookie, undefined);
  assert.equal((await handler(request("start", { showId: show, pin: config.pin }), "start")).status, 409);
  assert.equal((await handler(request("start", { showId: show, pin: config.pin }, null, "https://evil.example"), "start")).status, 403);
  assert.equal((await handler(request("start", { showId: show, pin: "x".repeat(9000) }), "start")).status, 400);
  assert.equal((await handler(request("status"), "start")).status, 405);
  const unavailable = http.createLyricSyncHttp(() => runtime.getLyricSyncService({}), () => config.origin);
  assert.equal((await unavailable(request("snapshot"), "snapshot")).status, 503);
  await assert.rejects(runtime.getLyricSyncService({ LYRIC_SYNC_ENABLED: "true" }));
  for (let i = 0; i < 2; i++) await handler(request("start", { showId: show, pin: "000000" }), "start");
  assert.equal((await handler(request("start", { showId: show, pin: config.pin }), "start")).status, 429);
});
test("HTTP status, renew, end, unauthorized publish and snapshot recovery remain scoped", async () => {
  const { service } = await fixture(); const handler = http.createLyricSyncHttp(async () => service, () => config.origin);
  const started = await start(service);
  assert.equal((await handler(request("status"), "status")).status, 401);
  assert.equal((await handler(request("status", null, started.cookie), "status")).status, 200);
  assert.equal((await handler(request("renew", { showId: show }, started.cookie), "renew")).status, 200);
  const value = { showId: show, state: open, requestId: other, expectedSequence: 0 };
  assert.equal((await handler(request("publish", value), "publish")).status, 401);
  assert.equal((await handler(request("publish", { ...value, showId: other }, started.cookie), "publish")).status, 401);
  assert.equal((await handler(request("publish", value, started.cookie), "publish")).status, 200);
  const snapshot = await handler(request("snapshot"), "snapshot");
  assert.match(snapshot.headers.get("cache-control"), /no-store/);
  assert.equal(JSON.parse((await snapshot.json()).snapshot.payload).state.sequence, 1);
  const ended = await handler(request("end", { showId: show }, started.cookie), "end");
  assert.equal(ended.status, 200); assert.match(ended.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await handler(request("publish", value, started.cookie), "publish")).status, 409);
});
test("HTTP Broadcast failure is explicit; same-ID retry keeps sequence and stale retries cannot overwrite", async () => {
  let fail = true; const { service, db } = await fixture({ async send() { if (fail) throw Error("local failure"); } });
  const started = await start(service), handler = http.createLyricSyncHttp(async () => service, () => config.origin);
  const value = { showId: show, state: open, requestId: other, expectedSequence: 0 };
  assert.equal((await handler(request("publish", value, started.cookie), "publish")).status, 502);
  fail = false;
  assert.equal((await handler(request("publish", value, started.cookie), "publish")).status, 200);
  assert.equal(db.rows.get(show).state.sequence, 1);
  assert.equal((await handler(request("publish", { ...value, requestId: show, expectedSequence: 1 }, started.cookie), "publish")).status, 200);
  assert.equal((await handler(request("publish", value, started.cookie), "publish")).status, 409);
  assert.equal(db.rows.get(show).state.sequence, 2);
});
test("installed HTTP Broadcast relay checks success, rejects failure, and removes its channel", async () => {
  let removed = 0, success = false;
  const channel = { async httpSend(event, payload, options) {
    assert.equal(event, "lyric_state"); assert.equal(options.timeout, 5000); assert.ok(payload.signature);
    return { success };
  } };
  const relay = runtime.createSupabaseLyricRelay({ channel(topic) { assert.equal(topic, messages.lyricSyncTopic(show)); return channel; },
    async removeChannel(value) { assert.equal(value, channel); removed++; } });
  const { service } = await fixture(); const signed = (await start(service)).snapshot;
  await assert.rejects(relay.send(messages.lyricSyncTopic(show), signed));
  success = true; await relay.send(messages.lyricSyncTopic(show), signed); assert.equal(removed, 2);
});
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setTimeout(resolve, 3)); };
test("browser subscribes before snapshot, verifies messages, recovers on reconnect and cleans up", async () => {
  const { service } = await fixture(); const started = await start(service); let receive, status, removed = 0, fetches = 0;
  const seen = [], statuses = [];
  const channel = { on(_type, _filter, callback) { receive = callback; return this; }, subscribe(callback) { status = callback; return this; } };
  const follower = client.followLyricSync({ client: { channel() { return channel; }, async removeChannel() { removed++; } }, showId: show,
    revision: () => revision, onState: state => seen.push(state), onStatus: value => statuses.push(value),
    async fetcher() { fetches++; return Response.json({ snapshot: await service.snapshot(show), publicKey: service.publicKey }); } });
  try {
    assert.equal(fetches, 0); status("SUBSCRIBED"); await settle(); assert.equal(seen.at(-1).state, "closed");
    const update = await service.publish(show, started.cookie, config.origin, open);
    receive({ payload: { ...update, signature: "a".repeat(86) } }); await settle(); assert.equal(seen.length, 1);
    receive({ payload: update }); await settle(); assert.equal(seen.at(-1).sequence, 1);
    receive({ payload: update }); await settle(); assert.equal(seen.length, 2);
    status("CHANNEL_ERROR");
    await service.publish(show, started.cookie, config.origin, { viewerSessionId: "viewer-one", state: "closed",
      setlistEntryId: null, lyricsRevision: null, position: null }, { requestId: other, expectedSequence: 1 });
    status("SUBSCRIBED"); await settle(); assert.equal(seen.at(-1).state, "closed"); assert.equal(fetches, 2);
    assert.ok(statuses.includes("disconnected"));
  } finally { follower.destroy(); }
  assert.equal(removed, 1);
});
test("browser failed snapshots freeze state; another publisher session cannot silently take over", async () => {
  const { service } = await fixture(); const started = await start(service); let status, failing = false;
  const seen = [], statuses = [];
  const channel = { on() { return this; }, subscribe(callback) { status = callback; return this; } };
  const follower = client.followLyricSync({ client: { channel() { return channel; }, async removeChannel() {} }, showId: show,
    revision: () => revision, onState: state => seen.push(state), onStatus: value => statuses.push(value),
    async fetcher() { if (failing) throw Error("offline"); return Response.json({ snapshot: await service.snapshot(show), publicKey: service.publicKey }); } });
  try {
    status("SUBSCRIBED"); await settle(); assert.equal(seen.length, 1);
    failing = true; await follower.reconcile(); assert.equal(seen.length, 1);
    failing = false; await service.revoke(show, started.cookie, config.origin); await start(service);
    await follower.reconcile(); assert.equal(seen.length, 1); assert.equal(statuses.at(-1), "disconnected");
  } finally { follower.destroy(); }
});
test("publisher coalesces updates and retries identical delivery identity after explicit Broadcast failure", async () => {
  const requests = [], statuses = [];
  const publisher = client.createLyricSyncPublisher(show, 0, value => statuses.push(value), async (_url, init) => {
    requests.push(init.body);
    return requests.length === 1 ? Response.json({}, { status: 502 }) : Response.json({ broadcastAccepted: true,
      snapshot: { payload: JSON.stringify({ state: { sequence: 1 } }) } });
  });
  try {
    publisher.publish({ state: "old" }); publisher.publish(open);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(requests.length, 2); assert.equal(requests[0], requests[1]);
    assert.equal(JSON.parse(requests[0]).state.setlistEntryId, open.setlistEntryId);
    assert.equal(statuses.at(-1), "broadcast-accepted");
  } finally { publisher.destroy(); }
});

test("publisher drains later coalesced batches and remains usable after draining", async () => {
  let count = 0, release;
  const first = new Promise(resolve => { release = resolve; });
  const publisher = client.createLyricSyncPublisher(show, 0, () => {}, async () => {
    count++;
    if (count === 1) await first;
    return Response.json({ broadcastAccepted: true, snapshot: { payload: JSON.stringify({ state: { sequence: count } }) } });
  });
  try {
    publisher.publish(open); await new Promise(resolve => setTimeout(resolve, 300));
    publisher.publish(open); release(); await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(count, 2);
    publisher.publish(open); await new Promise(resolve => setTimeout(resolve, 300)); assert.equal(count, 3);
  } finally { release(); publisher.destroy(); }
});

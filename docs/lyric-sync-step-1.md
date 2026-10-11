# Simple Lyric Sync — Step 1

Local, unwired foundation only. No SQL applied, credentials configured, routes exposed, or production connections made.

## Files

- `lib/lyric-sync-server.ts`: server-only service with injected configuration, store, and relay.
- `lib/lyric-sync-store.ts`: server-only allowlisted RPC adapter and strict result validation.
- `lib/lyric-sync-messages.ts`: browser-safe ECDSA verification and Phase 3A cursor acceptance.
- `lib/lyric-sync.test.mjs`: focused service, crypto, adapter, and static SQL tests.
- `supabase/migrations/20261010_add_simple_lyric_sync.sql`: proposed single-table migration and service-only registry function.
- This handoff document.

The Phase 3C four-table migration remains untouched and MUST NOT be applied as part of this design. Do not run a migration batch that includes it. A future approved operator must explicitly select the new migration after disposable database validation.

## Security and ownership

Configuration is explicitly injected: a private 6–12 digit PIN, a separate cookie secret of at least 32 bytes, an ECDSA P-256 private JWK, and an exact HTTPS origin. There is no environment reader, public/admin-password fallback, or active API route. Missing or invalid configuration rejects service construction. Keys are not generated or installed by the application. No secret values are logged.

PIN comparison hashes both values into equal-length SHA-256 buffers and uses timingSafeEqual. Every correctly scoped start attempt consumes a persistent show-wide counter BEFORE checking the PIN: five attempts per minute, including successful attempts. The window/counter lives in the same show row, survives session replacement, and uses the database clock. No process-memory production limiter exists. This bounds PIN guesses but permits denial of service by exhausting a show's attempts; future HTTP handlers need independently enforced trusted-IP/global limits and bounded request bodies. Do not expose the service before those route controls are reviewed.

The server generates session/publisher UUIDs and a random 256-bit session proof. Only its SHA-256 hash crosses the database boundary. A signed cookie carries the proof, scope, and absolute expiry; cookie options are Secure, HttpOnly, SameSite Strict with `/api/lyric-sync` scope and a 12-hour lifetime. HMAC signing is integrity protection, not encryption. Cookie/proof values must never appear in logs, URLs, or JSON responses from future routes. The service returns the cookie internally so a future route can set it; no browser endpoint currently returns it.

The session table uses show_id as primary key. An attempt inserts the initial empty row. Start then locks that row, refusing an active owner; simultaneous requests therefore target the same lock. Five-minute leases can renew up to an absolute 12-hour session limit. Expired/revoked sessions cannot renew or publish, and replacement requires another PIN verification. One cookie currently controls one show per browser, intentionally avoiding device accounts and multi-show complexity.

RLS is enabled without browser policies. Table privileges and registry execution are revoked from PUBLIC, anon, and authenticated. Only service_role is granted access. The function is SECURITY INVOKER with a fixed empty search path, schema-qualified tables, and no dynamic SQL. Actual target role inheritance, RLS bypass, FK compatibility, and RPC permissions remain unverified. This is a proposal, not a verified production schema.

## Message and snapshot contracts

Publish accepts only viewer identity, open/closed/calibrating state, setlist-entry identity, lyrics revision, and semantic position. Authority is constructed from the verified cookie, never client-selected device IDs. The Phase 3A parser rejects malformed or extra fields. The database revalidates scope/proof under the show-row lock, assigns the sequence, and stores the snapshot atomically. Neither lyrics nor notes are transmitted. Positions can move backward as well as forward.

Each exact UTF-8 payload is signed using standard Web Crypto ECDSA P-256/SHA-256. Browser verification uses only the trusted public JWK and rejects malformed envelopes, tampering, expiry, wrong show/session/publisher, duplicates, and stale sequences through Phase 3A. Messages expire after at most 60 seconds or the session lease, whichever is sooner. The verifier permits five seconds of forward clock skew; device clocks still matter. It never accepts a verification key supplied by a Broadcast message.

The topic is `lyric-sync:v1:<show-id>`, isolated from existing channels. A relay abstraction is injected; the default throws rather than sending. The adapter similarly requires an explicit trusted server RPC transport. No shared Supabase client is constructed or changed.

The snapshot is stored before relay delivery. A relay failure rejects the operation, while the saved snapshot remains available for recovery. Concurrent sends can arrive out of order; server sequences allow the receiver to reject older state. There is no durable outbox or guaranteed delivery. Future client logic must subscribe first, buffer incoming messages, retrieve an uncached HTTPS snapshot, establish its authority from that response, then reconcile the buffer by sequence. A server snapshot re-signs current persisted state with fresh message expiry. Do not establish authority from the first Broadcast packet or from an untrusted device ID.

Public Broadcast has no confidentiality. Signatures authenticate accepted contents, not Supabase channel membership; they do not prevent traffic flooding or replay of a still-valid signed packet to a newly initialized receiver. Trusted fresh snapshot bootstrap is required. Revocation stops new server operations but cannot recall packets already signed; they may remain valid for up to 60 seconds. Immediate revocation would require extra online authority checks or a different authorization design. The return-to-Wedge-Flow UI and semantic-to-local-layout mapping are NOT implemented in this step.

## Verification and activation gates

57 automated tests passed: 14 new tests, 9 Phase 3A protocol tests, 13 Phase 3C pairing tests, 4 Phase 3D characterization tests, and 17 existing Wedge tests. The Phase 3D tests still characterize the old foundation's known flaw; this step does not fix or activate it. TypeScript and scoped ESLint passed. Normal `npm run build` passed. New-file whitespace and tracked/staged diff checks passed.

Concurrency/expiry/rate-limit tests use a contract model, not PostgreSQL. Static SQL tests are not proof of SQL compilation, transaction isolation, RLS, or permissions. No verified disposable database was available. The migration is prepared for review but must pass real database tests before application: competing starts, publish versus stop/replacement, lease boundaries, counter concurrency, rollback after malformed writes, and anon/authenticated denial versus service access.

Still required, under separate approval: verified disposable DB execution; production server permissions/public Broadcast availability; private PIN/cookie/signing configuration; secure HTTP routes with no-store snapshot responses, cookie handling and additional request limits; actual relay binding; trusted snapshot bootstrap; and later UI integration/iPad testing. Do not deploy this as an active feature until those gates are satisfied.

Existing Live Mode, song synchronization, Smart Lyrics, Auto-Close, Wedge Flow, footswitch behavior, shared Supabase browser client, admin authentication, and all protected business systems are unchanged. Earlier untracked work and `supabase/manual-repairs/` remain untouched. No SQL, environment changes, production messages, commit, push, or deployment occurred.

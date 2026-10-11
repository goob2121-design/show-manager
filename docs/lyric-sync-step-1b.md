# Simple Lyric Sync — Step 1B

Local implementation only. The UI is unwired. No production requests, SQL, environment changes, commits, pushes, or deployment occurred. This document supersedes Step 1's statement that routes/transport are unimplemented.

## Routes

The single dynamic route `app/api/lyric-sync/[action]/route.ts` serves:

| Method | Path | Input |
| --- | --- | --- |
| POST | `/api/lyric-sync/start` | `showId`, `pin` |
| GET | `/api/lyric-sync/status` | `showId` query; owner cookie required |
| POST | `/api/lyric-sync/renew` | `showId`; owner cookie required |
| POST | `/api/lyric-sync/end` | `showId`; owner cookie required |
| POST | `/api/lyric-sync/publish` | `showId`, `state`, `requestId`, `expectedSequence`; owner cookie required |
| GET | `/api/lyric-sync/snapshot` | `showId` query; public signed state and public verification JWK |

All responses use no-store headers; there is no CORS permission. Mutations require an exact configured HTTPS Origin. Cross-site Fetch Metadata is rejected, including on reads. POST bodies must be JSON objects with an exact allowlist and an 8 KiB streamed limit. No submitted envelopes, authority fields, PINs, cookies, or arbitrary extra metadata can be relayed. Error responses are generic and do not expose database errors/configuration/credentials.

Start consumes the database-backed show-wide PIN counter before checking the PIN and sets only a Secure, HttpOnly, SameSite Strict cookie scoped to `/api/lyric-sync`. It does not return the proof in JSON. End clears the cookie only after successful revocation. Status validates ownership without extending the lease; renew extends only a still-valid lease, capped at 12 hours since creation. A future leader UI must renew well before the five-minute lease expires. Public snapshot has no owner proof or secret and does not renew authority.

## Configuration — documentation only

Server-only variables required for activation:

- `LYRIC_SYNC_ENABLED=true` — explicit opt-in; otherwise routes are unavailable.
- `LYRIC_SYNC_ORIGIN` — exact HTTPS StageFlow origin, without a trailing slash/path.
- `LYRIC_SYNC_PIN` — separate private 6–12 digit PIN; not the public admin password.
- `LYRIC_SYNC_COOKIE_SECRET` — independent cryptographically random secret, at least 32 bytes.
- `LYRIC_SYNC_SIGNING_PRIVATE_JWK` — JSON-serialized EC P-256 private signing JWK, imported through Web Crypto. Generate/manage it using a trusted standard key tool; never send it to a browser or include it in source control.
- Existing `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY`, whose actual registry/Broadcast permissions must be verified before activation.

No actual environment file or variable was changed. Importing modules/building does not invoke the service factory or contact Supabase. The runtime creates a separate server client only on an explicitly configured request, without auth persistence or refresh. All server fetches are uncached and time-bounded. The browser receives only the public JWK (`kty`, `crv`, `x`, `y`, verification usage), never the PIN/private key/service credential.

Secure cookies and exact HTTPS origin intentionally require HTTPS for local end-to-end cookie testing too; no insecure-development bypass is supplied.

## Broadcast and retries

Verified the installed SDK's `RealtimeChannel.httpSend(event, payload, { timeout })` declaration and implementation, and checked the [official Broadcast documentation](https://supabase.com/docs/guides/realtime/broadcast). The relay calls `httpSend("lyric_state", signedEnvelope, { timeout: 5000 })` on the public isolated `lyric-sync:v1:<show-id>` topic, requires `success: true`, and removes its channel in finally. It does not subscribe a server WebSocket or modify existing channels.

Supabase acceptance is NOT proof of delivery to a wedge. The response is named `broadcastAccepted`, never `delivered`. Signing remains exclusively server-side with ECDSA P-256/SHA-256. Public Broadcast has no confidentiality or membership authentication; receiver signature validation is mandatory.

The proposed table now adds `last_update_id`. Under the same show-row lock, publish checks owner proof/session expiry, confirms a non-closed setlist entry belongs to that show, validates the Phase 3A state, and performs an expected-sequence compare-and-set. A new accepted request increments the sequence and saves its snapshot before Broadcast. A retry of the most recent request ID with identical state returns that same sequence; a conflicting same-ID request fails. Once a later request is stored, an older retry's expected sequence fails rather than overwriting current state. There is no multi-request history or outbox.

Broadcast failure returns HTTP 502 explicitly stating that the snapshot was saved. Retry with the SAME request ID and expected sequence. A 409 requires owner status refresh; do not blindly assign a new ID/sequence to stale content. An isolated publisher queue coalesces to at most one in-flight request and four updates per second, tries the same request at most twice on uncertain/Broadcast failure, then stops and reports recovery needed. Repeated failures do not interrupt any existing feature because nothing is wired into existing UI.

## Browser recovery

`lib/lyric-sync-client.ts` creates an optional isolated, non-persistent public Supabase client; it never changes the shared client or its auth. Its receiver subscribes before requesting the uncached same-origin snapshot. Only that HTTPS snapshot can bootstrap authority and supply the trusted public verification key. Broadcast packets cannot choose the publisher/session/key. Signature and Phase 3A ordering checks apply to both snapshots and packets.

The receiver buffers a bounded number of packets during recovery, serializes async verification, rejects duplicates/out-of-order/tampered messages, and re-reads a snapshot after SUBSCRIBED/reconnect. Fifteen-second periodic reconciliation recovers missed state changes without assuming Broadcast replay. Failed snapshots freeze the current state and report disconnected; a null snapshot reports waiting. A replacement publisher/session is not silently adopted: explicit controller reinitialization is needed. Disposal removes the channel/timer and ignores late async results.

The module reports semantic state/alignment; it does NOT move a lyric document. Existing typography, pagination, calibration, footswitch, and Wedge Flow remain unchanged. There is no session-renewal UI, semantic layout mapping, or automatic close integration yet.

## Migration review and remaining gates

The one-table migration remains PROPOSED/UNAPPLIED. It retains persistent attempts, one-row locking, fresh database-time expiry checks, capped renewal, revocation, atomic sequences/snapshots, RLS, explicit browser privilege denial, and service-only SECURITY INVOKER registry access. This step adds ownership-checked status, song/show validation, and atomic retry protection. The earlier four-table migration is untouched and MUST NOT be included in an eventual migration batch.

Real PostgreSQL compilation, simultaneous transactions, rollback, RLS/role inheritance, target schema compatibility, and production Broadcast permission/public-channel configuration remain UNVERIFIED. Tests use injected contract models and fake transports, not production connections. Apply nothing until an approved disposable DB test and deployment/configuration review are complete.

Known limits: public-channel flooding/readability, show-wide PIN limiter exhaustion, clock skew, a single show cookie per browser, no durable outbox, and up to 60 seconds' validity for already-signed packets after revocation. A null snapshot provides status only; future UI must define its return-to-independent-flow response. Read-only song validation checks identity membership, not semantic position bounds or revision equivalence with saved lyrics; the eventual layout mapper must hold on mismatches/out-of-range anchors. Production ingress limits should supplement the persistent five-attempt-per-show-per-minute PIN limit.

## Verification

65 relevant tests passed (22 simple-sync tests plus 43 existing protocol/pairing/security-characterization/Wedge tests). Final standalone TypeScript and scoped ESLint passed with no warnings. One intermediate normal production build passed and included the new API route. However, the FINAL code's build verification is BLOCKED: the latest normal build compiled and finished TypeScript, then its worker exited with code 3221225477. Other attempts also exited without diagnostics or with that worker code. The cause has not been established; do not treat this as a final passing build or deployment readiness. No alternate Webpack build or configuration change was used. Git/whitespace review confirms only isolated lyric-sync files changed; no files were staged.

Changed Step 1 server/store/tests/migration; added HTTP handler, runtime relay binding, browser transport, route, and this document. Protected StageFlow features, existing clients/auth, prior Phase 3C migration, and `supabase/manual-repairs/` remain untouched.

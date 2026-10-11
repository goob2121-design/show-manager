import "server-only";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { parseLyricFollowMessage } from "./lyric-follow-protocol";
import { isSyncUuid, type LyricSyncStore } from "./lyric-sync-store";
import { lyricSyncTopic, type LyricSyncSnapshot, type SignedLyricState } from "./lyric-sync-messages";

export type LyricSyncConfig = { pin: string; cookieSecret: string; privateKey: JsonWebKey; origin: string };
export interface LyricSyncRelay { send(topic: string, message: SignedLyricState): Promise<void> }
export const blockedLyricSyncRelay: LyricSyncRelay = { async send() { throw new Error("Lyric relay not configured"); } };
const hash = (value: string) => createHash("sha256").update(value).digest();
const proofHash = (value: string) => hash(value).toString("hex");
const cookieOptions = { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/api/lyric-sync", maxAge: 12 * 3600 };
export const lyricSyncCookieName = "__Secure-stageflow-lyric-sync";

// Explicit dependencies; importing this module creates no network connections.
export async function createLyricSyncService(config: LyricSyncConfig, store: LyricSyncStore,
  relay: LyricSyncRelay = blockedLyricSyncRelay) {
  if (!config || !/^\d{6,12}$/.test(config.pin ?? "") || Buffer.byteLength(config.cookieSecret ?? "") < 32
    || new URL(config.origin).protocol !== "https:" || new URL(config.origin).origin !== config.origin
    || config.privateKey?.kty !== "EC" || config.privateKey.crv !== "P-256" || !config.privateKey.d) throw new Error("Lyric Sync unavailable");
  const signingKey = await crypto.subtle.importKey("jwk", config.privateKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const publicKey: JsonWebKey = { kty: "EC", crv: "P-256", x: config.privateKey.x, y: config.privateKey.y, ext: true, key_ops: ["verify"] };
  const mac = (value: string) => createHmac("sha256", config.cookieSecret).update(value).digest("base64url");
  const originCheck = (origin: string | null) => { if (origin !== config.origin) throw new Error("Lyric request rejected"); };
  function authority(cookie: string, showId: string) {
    if (typeof cookie !== "string" || cookie.length > 1024 || !isSyncUuid(showId)) throw new Error("Lyric request rejected");
    const [body, signature, extra] = cookie.split(".");
    const actual = Buffer.from(signature ?? ""), expected = Buffer.from(mac(body ?? ""));
    if (extra !== undefined || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Lyric request rejected");
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (data.showId !== showId || !isSyncUuid(data.sessionId) || !isSyncUuid(data.publisherId)
      || !/^[A-Za-z0-9_-]{43}$/.test(data.proof ?? "") || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Date.now()) throw new Error("Lyric request rejected");
    return { showId, sessionId: data.sessionId as string, publisherId: data.publisherId as string, proofHash: proofHash(data.proof) };
  }
  async function signed(snapshot: LyricSyncSnapshot): Promise<SignedLyricState> {
    const issuedAt = Date.now(), expiresAt = Math.min(snapshot.expiresAt, issuedAt + 60_000);
    if (expiresAt <= issuedAt) throw new Error("Lyric session expired");
    const payload = JSON.stringify({ version: 1, sessionId: snapshot.sessionId, issuedAt, expiresAt, state: snapshot.state });
    const signature = Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, new TextEncoder().encode(payload))).toString("base64url");
    return { payload, signature };
  }
  const snapshotResult = (value: boolean | LyricSyncSnapshot | null) => {
    if (!value || typeof value === "boolean") throw new Error("Lyric session unavailable or already active");
    return value;
  };
  return {
    publicKey,
    async status(showId: string, cookie: string) {
      return signed(snapshotResult(await store.run("status", authority(cookie, showId))));
    },
    async start(showId: string, pin: unknown, origin: string | null) {
      originCheck(origin);
      if (!isSyncUuid(showId)) throw new Error("Lyric request rejected");
      // This persistent show-wide attempt count is consumed before PIN checking.
      if (await store.run("attempt", { showId }) !== true) throw new Error("Try Lyric Sync again later");
      if (typeof pin !== "string" || pin.length > 128 || !timingSafeEqual(hash(pin), hash(config.pin))) throw new Error("PIN not accepted");
      const sessionId = randomUUID(), publisherId = randomUUID(), proof = randomBytes(32).toString("base64url");
      const snapshot = snapshotResult(await store.run("start", { showId, sessionId, publisherId, proofHash: proofHash(proof) }));
      const body = Buffer.from(JSON.stringify({ showId, sessionId, publisherId, proof, expiresAt: Date.now() + 12 * 3600_000 })).toString("base64url");
      return { cookie: `${body}.${mac(body)}`, cookieOptions, snapshot: await signed(snapshot) };
    },
    async renew(showId: string, cookie: string, origin: string | null) {
      originCheck(origin);
      return signed(snapshotResult(await store.run("renew", authority(cookie, showId))));
    },
    async revoke(showId: string, cookie: string, origin: string | null) {
      originCheck(origin);
      return await store.run("revoke", authority(cookie, showId)) === true;
    },
    async publish(showId: string, cookie: string, origin: string | null, input: unknown,
      delivery: { requestId: string; expectedSequence: number } = { requestId: randomUUID(), expectedSequence: 0 }) {
      originCheck(origin);
      const owner = authority(cookie, showId);
      // Clients supply only viewer/state/content position, never authority or sequence.
      if (!input || typeof input !== "object" || Object.keys(input).sort().join(",") !== "lyricsRevision,position,setlistEntryId,state,viewerSessionId") throw new Error("Invalid lyric state");
      const state = parseLyricFollowMessage({ ...input, version: 1, type: "lyric_state", showId,
        publisherId: owner.publisherId, publisherSessionId: owner.sessionId, sequence: 0 });
      if (!state || state.type !== "lyric_state") throw new Error("Invalid lyric state");
      if (!isSyncUuid(delivery.requestId) || !Number.isSafeInteger(delivery.expectedSequence) || delivery.expectedSequence < 0) throw new Error("Invalid lyric delivery");
      const snapshot = snapshotResult(await store.run("publish", { ...owner, state, ...delivery }));
      const message = await signed(snapshot);
      // Persistence precedes delivery. A failed send is reported, not called success;
      // reconnect retrieves the saved state. Sequence gaps are acceptable.
      try { await relay.send(lyricSyncTopic(showId), message); }
      catch { throw new Error("Lyric Broadcast failed; snapshot saved"); }
      return message;
    },
    async snapshot(showId: string) {
      if (!isSyncUuid(showId)) throw new Error("Invalid lyric scope");
      const value = await store.run("snapshot", { showId });
      return value === null ? null : signed(snapshotResult(value));
    },
  };
}

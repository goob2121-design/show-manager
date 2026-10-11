import { acceptLyricState, type LyricStateCursor, type LyricStateMessage } from "./lyric-follow-protocol";

export type SignedLyricState = { payload: string; signature: string };
export type LyricSyncSnapshot = { sessionId: string; state: LyricStateMessage; expiresAt: number };
export const lyricSyncTopic = (showId: string) => `lyric-sync:v1:${showId}`;

// Verify exact signed UTF-8 bytes; never trust a key included in a message.
export async function verifyLyricSyncMessage(envelope: unknown, key: CryptoKey, cursor: LyricStateCursor,
  now = Date.now(), revision?: string) {
  const reject = () => ({ accepted: false as const, reason: "invalid_signature_or_envelope", cursor });
  try {
    if (!envelope || typeof envelope !== "object") return reject();
    const e = envelope as SignedLyricState;
    if (Object.keys(e).sort().join(",") !== "payload,signature" || typeof e.payload !== "string" || e.payload.length > 8192
      || typeof e.signature !== "string" || !/^[A-Za-z0-9_-]{86}$/.test(e.signature)) return reject();
    const signature = Uint8Array.from(atob(e.signature.replace(/-/g, "+").replace(/_/g, "/") + "=="), c => c.charCodeAt(0));
    if (key.type !== "public" || key.algorithm.name !== "ECDSA"
      || !await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, new TextEncoder().encode(e.payload))) return reject();
    const value = JSON.parse(e.payload);
    if (!value || Object.keys(value).sort().join(",") !== "expiresAt,issuedAt,sessionId,state,version" || value.version !== 1
      || value.sessionId !== cursor.authority.publisherSessionId
      || !Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt)
      || value.issuedAt > now + 5000 || value.expiresAt <= now || value.expiresAt <= value.issuedAt
      || value.expiresAt - value.issuedAt > 60_000) return reject();
    return acceptLyricState(cursor, value.state, revision);
  } catch { return reject(); }
}

export async function importLyricSyncPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || jwk.d || !jwk.x || !jwk.y) throw new Error("Invalid lyric verification key");
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
}

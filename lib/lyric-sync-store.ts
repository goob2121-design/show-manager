import "server-only";
import { parseLyricFollowMessage, type LyricStateMessage } from "./lyric-follow-protocol";
import type { LyricSyncSnapshot } from "./lyric-sync-messages";

export type LyricSyncOperation = "attempt" | "start" | "status" | "renew" | "revoke" | "publish" | "snapshot";
export type LyricSyncInput = { showId: string; sessionId?: string; publisherId?: string; proofHash?: string; state?: LyricStateMessage; requestId?: string; expectedSequence?: number };
export interface LyricSyncStore {
  run(operation: LyricSyncOperation, input: LyricSyncInput): Promise<boolean | LyricSyncSnapshot | null>;
}
export const isSyncUuid = (value: unknown): value is string => typeof value === "string"
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);

// No Supabase client or credentials are constructed here. Only a separately
// approved server transport may bind this to lyric_sync_registry RPC.
export function createLyricSyncStore(rpc: (operation: LyricSyncOperation, input: LyricSyncInput) =>
  Promise<{ data: unknown; error: unknown }>): LyricSyncStore {
  return { async run(operation, input) {
    if (!isSyncUuid(input.showId)) throw new Error("Invalid lyric scope");
    // Explicit allowlist prevents cookie/proof propagation into RPC JSON.
    const safe: LyricSyncInput = { showId: input.showId };
    if (operation !== "attempt" && operation !== "snapshot") {
      if (!isSyncUuid(input.sessionId) || !/^[a-f0-9]{64}$/.test(input.proofHash ?? "")) throw new Error("Invalid lyric authority");
      safe.sessionId = input.sessionId; safe.proofHash = input.proofHash;
      if (operation === "start") {
        if (!isSyncUuid(input.publisherId)) throw new Error("Invalid lyric publisher");
        safe.publisherId = input.publisherId;
      }
      if (operation === "publish") {
        const state = parseLyricFollowMessage(input.state);
        if (!state || state.type !== "lyric_state" || state.showId !== input.showId || state.publisherSessionId !== input.sessionId) throw new Error("Invalid lyric state");
        safe.state = state;
        if (!isSyncUuid(input.requestId) || !Number.isSafeInteger(input.expectedSequence) || input.expectedSequence! < 0) throw new Error("Invalid lyric delivery");
        safe.requestId = input.requestId; safe.expectedSequence = input.expectedSequence;
      }
    }
    const { data, error } = await rpc(operation, safe);
    if (error) throw new Error("Lyric session unavailable");
    if (operation === "attempt" || operation === "revoke") {
      if (typeof data !== "boolean") throw new Error("Invalid lyric registry response");
      return data;
    }
    if (data === null) return null;
    if (!data || typeof data !== "object") throw new Error("Invalid lyric registry response");
    const result = data as LyricSyncSnapshot;
    const state = parseLyricFollowMessage(result.state);
    if (!isSyncUuid(result.sessionId) || !state || state.type !== "lyric_state" || state.showId !== input.showId
      || state.publisherSessionId !== result.sessionId || !isSyncUuid(state.publisherId)
      || (input.sessionId && result.sessionId !== input.sessionId)
      || (input.publisherId && state.publisherId !== input.publisherId)
      || !Number.isSafeInteger(result.expiresAt)) throw new Error("Invalid lyric registry response");
    return { sessionId: result.sessionId, expiresAt: result.expiresAt, state };
  } };
}

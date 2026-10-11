import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createLyricStateCursor, type LyricStateCursor, type LyricStateMessage } from "./lyric-follow-protocol";
import { importLyricSyncPublicKey, lyricSyncTopic, verifyLyricSyncMessage } from "./lyric-sync-messages";

type Client = Pick<SupabaseClient, "channel" | "removeChannel">;
export function createIsolatedLyricSyncClient(url: string, publicKey: string) {
  // No shared client/auth mutation and no persistent auth storage.
  return createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false,
    detectSessionInUrl: false, storageKey: "stageflow.lyricSync.transport" } });
}
export function followLyricSync(options: { client: Client; showId: string; revision: () => string | undefined;
  onState: (message: LyricStateMessage, alignment: string) => void; onStatus: (status: string) => void;
  fetcher?: typeof fetch; pollMs?: number }) {
  if (!/^[a-f0-9-]{36}$/i.test(options.showId)) throw new Error("Invalid lyric show");
  let disposed = false, subscribed = false, generation = 0, recovering = true, authoritative = false;
  let cursor: LyricStateCursor | null = null, key: CryptoKey | null = null;
  let buffer: unknown[] = [], chain = Promise.resolve(), queued = 0;
  const fetcher = options.fetcher ?? fetch;
  async function accept(payload: unknown, epoch: number) {
    if (disposed || epoch !== generation || !cursor || !key) return;
    const result = await verifyLyricSyncMessage(payload, key, cursor, Date.now(), options.revision());
    if (disposed || epoch !== generation || !result.accepted) return;
    cursor = result.cursor;
    options.onState(result.message, result.alignment);
  }
  async function reconcile() {
    if (disposed || !subscribed || recovering && generation > 0) return;
    recovering = true; authoritative = false; const epoch = ++generation;
    try {
      const response = await fetcher(`/api/lyric-sync/snapshot?showId=${encodeURIComponent(options.showId)}`,
        { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Snapshot unavailable");
      const result = await response.json();
      if (disposed || epoch !== generation) return;
      if (!result.snapshot) {
        buffer = []; options.onStatus("waiting"); return;
      }
      const nextKey = await importLyricSyncPublicKey(result.publicKey);
      // HTTPS snapshot is the authority bootstrap, never a Broadcast packet.
      const state = JSON.parse(result.snapshot.payload).state;
      const candidate = cursor ?? createLyricStateCursor({ showId: options.showId,
        publisherId: state.publisherId, publisherSessionId: state.publisherSessionId });
      const verified = await verifyLyricSyncMessage(result.snapshot, nextKey, candidate, Date.now(), options.revision());
      if (disposed || epoch !== generation) return;
      if (!verified.accepted && verified.reason !== "duplicate_sequence" && verified.reason !== "out_of_order") throw new Error("Snapshot authority rejected");
      key = nextKey;
      if (verified.accepted) {
        cursor = verified.cursor; options.onState(verified.message, verified.alignment);
      }
      // Serialize snapshot acceptance with the buffered network stream.
      let processed = 0;
      while (buffer.length && processed < 200 && !disposed && epoch === generation) {
        const pending = buffer; buffer = [];
        for (const payload of pending) { await accept(payload, epoch); processed++; }
      }
      if (!disposed && epoch === generation) { buffer = []; authoritative = true; options.onStatus("connected"); }
    } catch { if (!disposed && epoch === generation) { buffer = []; options.onStatus("disconnected"); } }
    finally { if (epoch === generation) recovering = false; }
  }
  const channel = options.client.channel(lyricSyncTopic(options.showId), { config: { private: false } })
    .on("broadcast", { event: "lyric_state" }, ({ payload }: { payload: unknown }) => {
      if (disposed || !subscribed) return;
      if (recovering || !cursor || !authoritative) { if (buffer.length < 100) buffer.push(payload); return; }
      if (queued >= 100) return;
      queued++;
      const epoch = generation;
      chain = chain.then(() => accept(payload, epoch)).catch(() => { if (!disposed) options.onStatus("disconnected"); }).finally(() => { queued--; });
    }).subscribe((status: string) => {
      if (disposed) return;
      subscribed = status === "SUBSCRIBED";
      ++generation; recovering = false; authoritative = false; buffer = [];
      if (subscribed) { options.onStatus("connecting"); void reconcile(); }
      else options.onStatus("disconnected");
    });
  // Low-frequency snapshots recover missed closes/starts without assuming replay.
  const timer = setInterval(() => { void reconcile(); }, Math.max(5000, options.pollMs ?? 15000));
  return { reconcile, destroy() { disposed = true; ++generation; clearInterval(timer); buffer = []; void options.client.removeChannel(channel); } };
}

// Future UI may use this queue: at most one in-flight update, coalesced to 4 Hz.
// On uncertain delivery, retry the SAME request ID and sequence; never blindly
// overwrite a newer position. A conflict requires explicit status recovery.
export function createLyricSyncPublisher(showId: string, initialSequence: number, report: (status: string) => void, fetcher: typeof fetch = fetch) {
  let sequence = initialSequence, pending: unknown, busy = false, stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function flush() {
    if (stopped || busy || pending === undefined) return;
    busy = true; const state = pending; pending = undefined;
    const request = JSON.stringify({ showId, state, requestId: crypto.randomUUID(), expectedSequence: sequence });
    try {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await fetcher("/api/lyric-sync/publish", { method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" }, body: request, signal: AbortSignal.timeout(8000) });
          if (response.status !== 502) break;
        } catch { if (attempt === 1) throw new Error("Publish unavailable"); }
      }
      if (!response?.ok) throw new Error("Publish unavailable");
      const data = await response.json();
      if (data.broadcastAccepted !== true) throw new Error("Publish unavailable");
      sequence = JSON.parse(data.snapshot.payload).state.sequence;
      if (!Number.isSafeInteger(sequence)) throw new Error("Publish unavailable");
      if (!stopped) report("broadcast-accepted");
    } catch { if (!stopped) report("disconnected-refresh-status"); stopped = true; }
    finally { busy = false; if (!stopped && pending !== undefined) timer = setTimeout(() => { timer = undefined; void flush(); }, 250); }
  }
  return { publish(state: unknown) { if (stopped) return; pending = state; if (!busy && !timer) timer = setTimeout(() => { timer = undefined; void flush(); }, 250); },
    destroy() { stopped = true; pending = undefined; clearTimeout(timer); } };
}

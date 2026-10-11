import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createLyricSyncService, type LyricSyncRelay } from "./lyric-sync-server";
import { createLyricSyncStore } from "./lyric-sync-store";

export function createSupabaseLyricRelay(client: Pick<SupabaseClient, "channel" | "removeChannel">): LyricSyncRelay {
  return { async send(topic, message) {
    if (!/^lyric-sync:v1:[a-f0-9-]{36}$/i.test(topic)) throw new Error("Invalid lyric topic");
    const channel = client.channel(topic, { config: { private: false } });
    try {
      // Installed realtime-js httpSend uses REST regardless of socket state.
      const result = await channel.httpSend("lyric_state", message, { timeout: 5000 });
      if (!result.success) throw new Error("Lyric Broadcast unavailable");
    } finally { await client.removeChannel(channel); }
  } };
}

export async function getLyricSyncService(env: NodeJS.ProcessEnv = process.env) {
  // Explicit activation gate prevents existing server credentials alone from
  // making these new routes operational. Nothing reads/writes env files.
  if (env.LYRIC_SYNC_ENABLED !== "true" || !env.LYRIC_SYNC_PIN || !env.LYRIC_SYNC_COOKIE_SECRET
    || !env.LYRIC_SYNC_SIGNING_PRIVATE_JWK || !env.LYRIC_SYNC_ORIGIN
    || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Lyric Sync unavailable");
  const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  if (url.protocol !== "https:") throw new Error("Lyric Sync unavailable");
  const config = { pin: env.LYRIC_SYNC_PIN, cookieSecret: env.LYRIC_SYNC_COOKIE_SECRET,
    privateKey: JSON.parse(env.LYRIC_SYNC_SIGNING_PRIVATE_JWK) as JsonWebKey, origin: env.LYRIC_SYNC_ORIGIN };
  const client = createClient(url.origin, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }) },
  });
  const store = createLyricSyncStore(async (operation, input) => {
    const { data, error } = await client.rpc("lyric_sync_registry", { p_operation: operation, p_input: input });
    return { data, error };
  });
  return createLyricSyncService(config, store, createSupabaseLyricRelay(client));
}

import "server-only";
import { lyricSyncCookieName, type createLyricSyncService } from "./lyric-sync-server";
import { isSyncUuid } from "./lyric-sync-store";

type Service = Awaited<ReturnType<typeof createLyricSyncService>>;
const actions = ["start", "status", "renew", "end", "publish", "snapshot"];
const headers = { "Cache-Control": "no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff" };
function json(value: unknown, status = 200, cookie?: string) {
  return Response.json(value, { status, headers: { ...headers, ...(cookie ? { "Set-Cookie": cookie } : {}) } });
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Invalid request");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Invalid request");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength;
      if (length > 8192) { await reader.cancel(); throw new Error("Invalid request"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid request");
  return value;
}
function cookie(request: Request) {
  const values = (request.headers.get("cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith(`${lyricSyncCookieName}=`));
  if (values.length !== 1) return "";
  return values[0].slice(lyricSyncCookieName.length + 1);
}
const setCookie = (value: string, maxAge = 43200) => `${lyricSyncCookieName}=${value}; Path=/api/lyric-sync; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;

// Injectable service factory keeps route tests local and never logs credentials.
export function createLyricSyncHttp(getService: () => Promise<Service>, expectedOrigin: () => string | undefined) {
  return async (request: Request, action: string) => {
    if (!actions.includes(action)) return json({ error: "Not found" }, 404);
    const read = action === "snapshot" || action === "status";
    if (request.method !== (read ? "GET" : "POST")) return json({ error: "Method not allowed" }, 405);
    try {
      const origin = expectedOrigin();
      if (!origin || new URL(origin).protocol !== "https:" || new URL(origin).origin !== origin) return json({ error: "Lyric Sync unavailable" }, 503);
      if ((!read && request.headers.get("origin") !== origin)
        || request.headers.get("sec-fetch-site") === "cross-site"
        || (read && request.headers.has("origin") && request.headers.get("origin") !== origin)) return json({ error: "Request rejected" }, 403);
      const input = read ? Object.fromEntries(new URL(request.url).searchParams) : await body(request);
      const allowed = action === "start" ? ["showId", "pin"] : action === "publish" ? ["showId", "state", "requestId", "expectedSequence"] : ["showId"];
      if (Object.keys(input).sort().join(",") !== allowed.sort().join(",") || !isSyncUuid(input.showId)) return json({ error: "Invalid request" }, 400);
      const service = await getService(), showId = input.showId, sessionCookie = cookie(request);
      if (action === "start") {
        const result = await service.start(showId, input.pin, request.headers.get("origin"));
        return json({ snapshot: result.snapshot, publicKey: service.publicKey }, 200, setCookie(result.cookie));
      }
      if (action === "snapshot") return json({ snapshot: await service.snapshot(showId), publicKey: service.publicKey });
      if (action === "status") return json({ snapshot: await service.status(showId, sessionCookie), publicKey: service.publicKey });
      if (action === "renew") return json({ snapshot: await service.renew(showId, sessionCookie, request.headers.get("origin")) });
      if (action === "end") {
        if (!await service.revoke(showId, sessionCookie, request.headers.get("origin"))) return json({ error: "Session not active" }, 409);
        return json({ ended: true }, 200, setCookie("", 0));
      }
      if (!isSyncUuid(input.requestId) || !Number.isSafeInteger(input.expectedSequence) || Number(input.expectedSequence) < 0) return json({ error: "Invalid request" }, 400);
      const message = await service.publish(showId, sessionCookie, request.headers.get("origin"), input.state,
        { requestId: input.requestId, expectedSequence: input.expectedSequence as number });
      // "accepted" means Supabase accepted the Broadcast, NOT wedge delivery.
      return json({ broadcastAccepted: true, snapshot: message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "Lyric Broadcast failed; snapshot saved") return json({ error: "Broadcast failed; snapshot saved. Retry the same request or refresh status.", broadcastAccepted: false }, 502);
      if (message === "PIN not accepted") return json({ error: "PIN not accepted" }, 401);
      if (message === "Try Lyric Sync again later") return json({ error: "Try again later" }, 429);
      if (message === "Lyric request rejected") return json({ error: "Session authorization required" }, 401);
      if (message === "Lyric session unavailable or already active") return json({ error: "Session inactive, already owned, or sequence changed. Refresh status." }, 409);
      if (message.startsWith("Invalid") || error instanceof SyntaxError) return json({ error: "Invalid request" }, 400);
      return json({ error: "Lyric Sync unavailable" }, 503);
    }
  };
}

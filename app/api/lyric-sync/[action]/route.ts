import { createLyricSyncHttp } from "@/lib/lyric-sync-http";
import { getLyricSyncService } from "@/lib/lyric-sync-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = createLyricSyncHttp(() => getLyricSyncService(), () => process.env.LYRIC_SYNC_ORIGIN);
export async function GET(request: Request, context: { params: Promise<{ action: string }> }) {
  return handle(request, (await context.params).action);
}
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  return handle(request, (await context.params).action);
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadFootswitchSongLibrary, combineFootswitchSongs } from "./footswitch-song-library";
import { SmartLyricPagingTest } from "./footswitch-smart-paging-test";
import type { FootswitchSong } from "./footswitch-song-source";

export function FootswitchLibraryPagingTest({ songs, showId, onReturn }: { songs: readonly FootswitchSong[]; showId?: string; onReturn: () => void }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadFootswitchSongLibrary>> | null>(null);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(undefined);
      try {
        const next = await loadFootswitchSongLibrary(createClient(), showId);
        if (!cancelled) setResult(next);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Could not load StageFlow songs. Please retry.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [showId, attempt]);
  const available = useMemo(() => result ? combineFootswitchSongs(result.library, result.guests, songs) : [], [result, songs]);
  return <SmartLyricPagingTest songs={available} songStatus={loading ? "Loading StageFlow song library…" : error}
    onRetry={error ? () => setAttempt((value) => value + 1) : undefined} onReturn={onReturn} />;
}

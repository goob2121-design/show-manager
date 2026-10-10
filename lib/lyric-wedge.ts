export type WedgeLiveState = { current_song_index: number; updated_at: string };
export type WedgeConnection = "connecting" | "connected" | "disconnected";

// Match Live Mode's section/position/created_at ordering without mounting its
// controller (which initializes shared state with a database write).
export function sortWedgeEntries<T extends { section: string | null; position: number; created_at: string }>(rows: T[]): T[] {
  const rank = (section: string | null) => section === "set2" ? 2 : section === "encore" ? 3 : 1;
  return [...rows].sort((a, b) => rank(a.section) - rank(b.section) || a.position - b.position || a.created_at.localeCompare(b.created_at));
}

export function selectedWedgeEntry<T>(entries: T[], state: WedgeLiveState | null): T | null {
  if (!state || !entries.length) return null;
  return entries[Math.max(0, Math.min(entries.length - 1, state.current_song_index))] ?? null;
}

export function resetWedgePosition(page: Pick<Window, "scrollTo">) {
  page.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

export function createWedgePageReset(expectedEntry?: string) {
  let readyEntry: string | null = null;
  return {
    ready(entryId: string, scroll: () => void) {
      if (expectedEntry !== undefined && entryId !== expectedEntry) return;
      if (readyEntry === entryId) return;
      // Mark before scrolling: synchronous scroll observation cannot reset twice.
      readyEntry = entryId;
      scroll();
    },
  };
}

// Subscription first, then snapshot. A snapshot started before a realtime
// event or a newer reconciliation must never replace that newer information.
export function followWedgeState(api: {
  read: () => Promise<WedgeLiveState | null>;
  subscribe: (receive: (state: WedgeLiveState | null) => void, status: (value: string) => void) => () => void;
}, onState: (state: WedgeLiveState | null) => void, onConnection: (value: WedgeConnection) => void) {
  let disposed = false, generation = 0, latest: WedgeLiveState | null = null;
  const accept = (state: WedgeLiveState | null) => {
    if (state && latest && state.updated_at < latest.updated_at) return;
    latest = state;
    onState(state);
  };
  const reconcile = async () => {
    const request = ++generation;
    try {
      const state = await api.read();
      if (!disposed && request === generation) accept(state);
    } catch {
      if (!disposed && request === generation) onConnection("disconnected");
    }
  };
  const unsubscribe = api.subscribe((state) => {
    if (disposed) return;
    ++generation;
    accept(state);
  }, (status) => {
    if (disposed) return;
    if (status === "SUBSCRIBED") {
      onConnection("connected");
      void reconcile();
    } else {
      ++generation;
      onConnection(status === "CONNECTING" ? "connecting" : "disconnected");
    }
  });
  void reconcile();
  return {
    reconcile,
    offline() { ++generation; if (!disposed) onConnection("disconnected"); },
    destroy() { disposed = true; ++generation; unsubscribe(); },
  };
}

// Keep the user's intent separate from the sentinel: visibility/power changes
// release the sentinel, but should not silently disable the requested setting.
export function createWedgeWakeLock(doc: Document, nav: Navigator, report: (message: string) => void) {
  let wanted = false, disposed = false, pending = false;
  let lock: WakeLockSentinel | null = null;
  const acquire = async () => {
    if (!wanted || disposed || pending || lock || doc.visibilityState !== "visible") return;
    if (!("wakeLock" in nav)) { report("Keep awake unavailable"); return; }
    pending = true;
    try {
      const acquired = await nav.wakeLock.request("screen");
      if (!wanted || disposed || doc.visibilityState !== "visible") { await acquired.release(); return; }
      lock = acquired;
      report("Screen kept awake");
      acquired.addEventListener("release", () => {
        if (lock !== acquired) return;
        lock = null;
        if (!disposed) report(wanted ? "Wake lock released — restores when visible" : "Keep awake off");
      });
    } catch { if (!disposed) report("Keep awake unavailable — check device sleep settings"); }
    finally { pending = false; }
  };
  const visible = () => { void acquire(); };
  doc.addEventListener("visibilitychange", visible);
  return {
    enable() { wanted = true; void acquire(); },
    disable() { wanted = false; const current = lock; lock = null; void current?.release(); report("Keep awake off"); },
    destroy() { disposed = true; wanted = false; doc.removeEventListener("visibilitychange", visible); void lock?.release(); lock = null; },
  };
}

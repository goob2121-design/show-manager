"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  slug: string;
  showId: string;
  enabled: boolean;
  startedAt: string | null;
};

function toLocalDateTimeInput(value: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export function SquareFinanceSyncControl({ slug, showId, enabled, startedAt }: Props) {
  const router = useRouter();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [startValue, setStartValue] = useState(() => toLocalDateTimeInput(startedAt));
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const parsedStart = startValue ? new Date(startValue) : null;
      if (isEnabled && (!parsedStart || Number.isNaN(parsedStart.getTime()))) {
        throw new Error("Choose a valid sync start time before enabling.");
      }
      const response = await fetch("/api/integrations/square/finance-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          showId,
          enabled: isEnabled,
          startedAt: parsedStart?.toISOString() ?? null,
        }),
      });
      const result = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to update Square Finance settings.");
      setMessage(isEnabled ? "Automatic Square presale income is enabled." : "Automatic Square presale income is off.");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update Square Finance settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Phase 1 Finance Sync</p>
      <h2 className="mt-1 text-xl font-black">Automatic Square Presale Income</h2>
      <p className="mt-2 text-sm text-stone-600">
        Adds actual completed Square line-item totals to Presale Tickets. Existing sales before the cutoff and manual Finance rows are untouched.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[auto_minmax(0,18rem)_auto] sm:items-end">
        <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-800">
          <input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
          Enable for this show
        </label>
        <label className="grid gap-2 text-sm font-semibold text-stone-800">
          Sync sales completed at or after
          <input
            type="datetime-local"
            value={startValue}
            onChange={(event) => setStartValue(event.target.value)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-emerald-500"
          />
        </label>
        <button type="button" onClick={() => void save()} disabled={isSaving} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60">
          {isSaving ? "Saving..." : "Save Finance Sync"}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
    </section>
  );
}

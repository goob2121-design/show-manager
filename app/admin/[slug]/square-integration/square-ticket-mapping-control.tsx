"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { SquareCatalogMappingOption } from "@/app/api/integrations/square/catalog-mapping";

type Props = {
  slug: string;
  showId: string;
  showName: string;
  environment: "sandbox" | "production";
  options: SquareCatalogMappingOption[];
  currentMapping: SquareCatalogMappingOption | null;
};

type PendingReplacement = {
  current: SquareCatalogMappingOption;
  selected: SquareCatalogMappingOption;
};

function maskIdentifier(value: string) {
  return value.length <= 8 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function SquareTicketMappingControl({
  slug,
  showId,
  showName,
  environment,
  options,
  currentMapping,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeVariationId, setActiveVariationId] = useState<string | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState<PendingReplacement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) =>
      [option.itemName, option.variationName, option.price, option.currency, option.variationId]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [options, search]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && pendingReplacement) {
      console.debug("Square mapping modal state opened.", {
        currentVariationId: maskIdentifier(pendingReplacement.current.variationId),
        selectedVariationId: maskIdentifier(pendingReplacement.selected.variationId),
      });
    }
  }, [pendingReplacement]);

  async function updateMapping(
    input: { action: "connect" | "disconnect"; variationId?: string; replaceConfirmed?: boolean },
    successMessage?: string,
  ) {
    if (
      input.action === "connect" &&
      input.variationId &&
      input.replaceConfirmed !== true &&
      currentMapping &&
      currentMapping.variationId !== input.variationId
    ) {
      const selected = options.find((option) => option.variationId === input.variationId);
      if (selected) {
        setPendingReplacement({ current: currentMapping, selected });
      }
      return;
    }

    setActiveVariationId(input.variationId ?? "disconnect");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/integrations/square/catalog-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          slug,
          showId,
          environment,
        }),
      });
      const result = (await response.json()) as { success?: boolean; message?: string; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to update the Square ticket mapping.");
      setMessage(successMessage ?? result.message ?? "Square ticket mapping updated.");
      setPendingReplacement(null);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update the Square ticket mapping.");
    } finally {
      setActiveVariationId(null);
    }
  }

  function handleConnectClick(
    event: MouseEvent<HTMLButtonElement>,
    option: SquareCatalogMappingOption,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const replacing = Boolean(currentMapping && currentMapping.variationId !== option.variationId);
    if (replacing && currentMapping) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("Square mapping replacement candidate selected.", {
          currentVariationId: maskIdentifier(currentMapping.variationId),
          selectedVariationId: maskIdentifier(option.variationId),
        });
      }
      setMessage(null);
      setError(null);
      setPendingReplacement({ current: currentMapping, selected: option });
      return;
    }

    void updateMapping({ action: "connect", variationId: option.variationId });
  }

  function replaceMapping() {
    if (!pendingReplacement) return;
    if (process.env.NODE_ENV !== "production") {
      console.debug("Square mapping replacement confirmed.", {
        currentVariationId: maskIdentifier(pendingReplacement.current.variationId),
        selectedVariationId: maskIdentifier(pendingReplacement.selected.variationId),
      });
    }
    void updateMapping(
      {
        action: "connect",
        variationId: pendingReplacement.selected.variationId,
        replaceConfirmed: true,
      },
      "Square ticket mapping replaced successfully.",
    );
  }

  function disconnect() {
    const confirmed = window.confirm(
      "Disconnecting this ticket will prevent future Square purchases of this variation from being matched to this show. Existing imported tickets and reserved-seat links will not be deleted.",
    );
    if (confirmed) void updateMapping({ action: "disconnect" });
  }

  const environmentLabel = environment === "production" ? "Production" : "Sandbox";

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Square {environmentLabel} Ticket Mapping</p>
          <h2 className="mt-1 text-xl font-black">Square Ticket Mapping</h2>
          <div className="mt-3 grid gap-1 text-sm text-stone-600">
            <p><strong className="text-stone-900">Environment:</strong> {environmentLabel}</p>
            <p><strong className="text-stone-900">Show:</strong> {showName}</p>
            <p><strong className="text-stone-900">Slug:</strong> {slug}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#square-ticket-options" className="inline-flex rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
            Connect Ticket
          </a>
          <Link href={`/admin/${encodeURIComponent(slug)}/square-catalog`} className="inline-flex rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
            Browse Square Catalog
          </Link>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Current mapped Square variation</p>
        {currentMapping ? (
          <div className="mt-2 grid gap-1 text-sm">
            <p className="font-bold text-stone-900">{currentMapping.itemName} - {currentMapping.variationName}</p>
            <p>{currentMapping.price} {currentMapping.currency} · {currentMapping.status}</p>
            <p>{currentMapping.locationAvailability} · {maskIdentifier(currentMapping.variationId)}</p>
            <button type="button" onClick={disconnect} disabled={activeVariationId !== null} className="mt-3 inline-flex w-fit rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60">
              {activeVariationId === "disconnect" ? "Disconnecting..." : "Disconnect Ticket"}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-600">No Square ticket is connected to this show.</p>
        )}
      </div>

      <div className="mt-5" id="square-ticket-options">
        <label className="block text-sm font-bold text-stone-800" htmlFor="square-ticket-search">Search Square tickets</label>
        <input id="square-ticket-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, variation, price, or ID" className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-500" />
      </div>

      <div className="mt-4 grid gap-3">
        {filteredOptions.map((option) => {
          const isCurrent = currentMapping?.variationId === option.variationId;
          return (
            <div key={option.variationId} className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${isCurrent ? "border-emerald-300 bg-emerald-50" : "border-stone-200 bg-white"}`}>
              <div className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-stone-900">{option.itemName} - {option.variationName}</p>
                  {isCurrent ? <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white">Current</span> : null}
                </div>
                <p className="mt-1 text-stone-600">{option.price} {option.currency} · {option.status} · {option.locationAvailability}</p>
                <p className="mt-1 font-mono text-xs text-stone-500">{maskIdentifier(option.variationId)}</p>
              </div>
              <button type="button" onClick={(event) => handleConnectClick(event, option)} disabled={isCurrent || activeVariationId !== null} className="inline-flex shrink-0 justify-center rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                {activeVariationId === option.variationId ? "Connecting..." : isCurrent ? "Connected" : "Connect to This Show"}
              </button>
            </div>
          );
        })}
        {filteredOptions.length === 0 ? <p className="rounded-xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">No eligible Square Item Variations match this search.</p> : null}
      </div>

      {pendingReplacement ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="replace-square-mapping-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl sm:p-6">
            <h2 id="replace-square-mapping-title" className="text-xl font-black text-stone-900">
              Replace Square Ticket Mapping?
            </h2>

            <div className="mt-5 grid gap-4">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Current mapping</p>
                <p className="mt-2 font-semibold text-stone-900">
                  {pendingReplacement.current.itemName} - {pendingReplacement.current.variationName}
                </p>
                <p className="mt-1 font-mono text-xs text-stone-500">{maskIdentifier(pendingReplacement.current.variationId)}</p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">New mapping</p>
                <p className="mt-2 font-semibold text-stone-900">
                  {pendingReplacement.selected.itemName} - {pendingReplacement.selected.variationName}
                </p>
                <p className="mt-1 font-mono text-xs text-stone-500">{maskIdentifier(pendingReplacement.selected.variationId)}</p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-bold">Warning</p>
                <p className="mt-1 leading-6">
                  Replacing this mapping affects only future Square purchases. Existing imported tickets,
                  reserved-seat links, seat assignments, pending checkouts, and event logs will not be deleted.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingReplacement(null)}
                disabled={activeVariationId !== null}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={replaceMapping}
                disabled={activeVariationId !== null}
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {activeVariationId === pendingReplacement.selected.variationId ? "Replacing..." : "Replace Mapping"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-4 text-sm font-semibold text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p> : null}
    </section>
  );
}

"use client";

import { useState } from "react";

type DebugLatestImportButtonProps = {
  paymentId: string | null;
  orderId: string | null;
};

export function DebugLatestImportButton({ paymentId, orderId }: DebugLatestImportButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debugJson, setDebugJson] = useState<unknown>(null);

  async function handleDebugLatestImport() {
    const params = new URLSearchParams();
    if (orderId) params.set("orderId", orderId);
    else if (paymentId) params.set("paymentId", paymentId);

    if (!params.toString()) {
      setErrorMessage("Latest import does not include a payment ID or order ID.");
      setDebugJson(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/integrations/square/debug-order?${params.toString()}`);
      const payload = await response.json() as unknown;
      setDebugJson(payload);
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Unable to debug latest Square import.";
        setErrorMessage(message);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to debug latest Square import.");
      setDebugJson(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Debug Latest Import</h2>
          <p className="text-sm text-stone-600">Temporary Sandbox-only tool. Shows sanitized Square order JSON for the newest import record.</p>
        </div>
        <button type="button" onClick={() => void handleDebugLatestImport()} disabled={isLoading || (!paymentId && !orderId)} className="inline-flex rounded-xl border border-sky-300 bg-white px-4 py-2 text-sm font-bold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60">
          {isLoading ? "Loading..." : "Debug Latest Import"}
        </button>
      </div>

      <div className="mt-3 grid gap-1 text-xs text-stone-600 sm:grid-cols-2">
        <p><span className="font-semibold">Order ID:</span> {orderId ? "available" : "not available"}</p>
        <p><span className="font-semibold">Payment ID:</span> {paymentId ? "available" : "not available"}</p>
      </div>

      {errorMessage ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{errorMessage}</p> : null}
      {debugJson ? (
        <pre className="mt-4 max-h-[32rem] overflow-auto rounded-xl border border-sky-200 bg-white p-3 text-xs leading-relaxed text-stone-800">
          {JSON.stringify(debugJson, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
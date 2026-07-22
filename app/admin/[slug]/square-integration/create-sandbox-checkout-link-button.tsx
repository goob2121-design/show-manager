"use client";

import { useState } from "react";

type CheckoutLinkResult = {
  id: string;
  url: string;
  longUrl: string | null;
  orderId: string | null;
  createdAt: string;
};

type SquareErrorDetail = {
  category?: string;
  code?: string;
  detail?: string;
  field?: string;
};

type SquareErrorResponse = {
  httpStatus: number;
  statusText: string;
  errors: SquareErrorDetail[];
};

type CheckoutDiagnostics = {
  variationRetrievalSucceeded: boolean;
  variationType: string | null;
  selectedLocationIdMasked: string | null;
  presentAtAllLocations: boolean | null;
  presentAtLocationIds: string[];
  absentAtLocationIds: string[];
  catalogBackedAttempted: boolean;
  adHocFallbackUsed: boolean;
  lineItem: Record<string, unknown> | null;
  squareError?: SquareErrorResponse;
};

type CreateSandboxCheckoutLinkButtonProps = {
  slug: string;
};

function formatCreatedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function formatList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "None";
}

export function CreateSandboxCheckoutLinkButton({ slug }: CreateSandboxCheckoutLinkButtonProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutLinkResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<CheckoutDiagnostics | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [squareError, setSquareError] = useState<SquareErrorResponse | null>(null);

  async function handleCreate() {
    setIsCreating(true);
    setErrorMessage(null);
    setSquareError(null);
    setDiagnostics(null);

    try {
      const response = await fetch("/api/integrations/square/checkout-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, quantity: 1 }),
      });
      const payload = (await response.json()) as { success?: boolean; checkout?: CheckoutLinkResult; error?: string; squareError?: SquareErrorResponse; diagnostics?: CheckoutDiagnostics };
      setDiagnostics(payload.diagnostics ?? null);
      if (!response.ok || !payload.success || !payload.checkout) {
        setSquareError(payload.squareError ?? payload.diagnostics?.squareError ?? null);
        throw new Error(payload.error || "Unable to create Sandbox checkout link.");
      }
      setCheckout(payload.checkout);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create Sandbox checkout link.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-stone-900">Sandbox Checkout Link</h2>
          <p className="text-sm text-stone-600">Creates a temporary Square-hosted checkout link for the mapped catalog variation. Nothing is saved in StageFlow.</p>
        </div>
        <button type="button" onClick={() => void handleCreate()} disabled={isCreating} className="inline-flex rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60">
          {isCreating ? "Creating..." : "Create Sandbox Checkout Link"}
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <p className="font-bold">{squareError ? "Square Error:" : "Error:"}</p>
          <p className="font-semibold">{errorMessage}</p>
          {squareError ? (
            <div className="mt-2 grid gap-1">
              <p><span className="font-semibold">HTTP status:</span> {squareError.httpStatus} {squareError.statusText}</p>
              {squareError.errors.length > 0 ? squareError.errors.map((item, index) => (
                <div key={`${item.code ?? "square-error"}-${index}`} className="rounded-lg bg-white/70 px-2 py-1">
                  {item.category ? <p><span className="font-semibold">Category:</span> {item.category}</p> : null}
                  {item.code ? <p><span className="font-semibold">Code:</span> {item.code}</p> : null}
                  {item.detail ? <p><span className="font-semibold">Detail:</span> {item.detail}</p> : null}
                  {item.field ? <p><span className="font-semibold">Field:</span> {item.field}</p> : null}
                </div>
              )) : <p>No Square error detail was returned.</p>}
            </div>
          ) : null}
        </div>
      ) : null}

      {checkout ? (
        <div className="mt-4 grid gap-2 rounded-xl border border-emerald-200 bg-white p-3 text-sm">
          <p><span className="font-semibold text-stone-600">Checkout URL:</span> <a href={checkout.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline">{checkout.url}</a></p>
          <p><span className="font-semibold text-stone-600">Checkout ID:</span> <span className="font-mono text-xs">{checkout.id}</span></p>
          <p><span className="font-semibold text-stone-600">Created:</span> {formatCreatedAt(checkout.createdAt)}</p>
        </div>
      ) : null}

      {diagnostics ? (
        <div className="mt-4 grid gap-1 rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-700">
          <p className="text-sm font-bold text-stone-900">Sandbox Diagnostics</p>
          <p><span className="font-semibold">Variation retrieval succeeded:</span> {diagnostics.variationRetrievalSucceeded ? "yes" : "no"}</p>
          <p><span className="font-semibold">Variation type:</span> {diagnostics.variationType ?? "-"}</p>
          <p><span className="font-semibold">Selected location:</span> {diagnostics.selectedLocationIdMasked ?? "-"}</p>
          <p><span className="font-semibold">present_at_all_locations:</span> {String(diagnostics.presentAtAllLocations)}</p>
          <p><span className="font-semibold">present_at_location_ids:</span> {formatList(diagnostics.presentAtLocationIds)}</p>
          <p><span className="font-semibold">absent_at_location_ids:</span> {formatList(diagnostics.absentAtLocationIds)}</p>
          <p><span className="font-semibold">Catalog-backed attempted:</span> {diagnostics.catalogBackedAttempted ? "yes" : "no"}</p>
          <p><span className="font-semibold">Ad hoc fallback used:</span> {diagnostics.adHocFallbackUsed ? "yes" : "no"}</p>
          <p><span className="font-semibold">Line item:</span> <code>{diagnostics.lineItem ? JSON.stringify(diagnostics.lineItem) : "-"}</code></p>
        </div>
      ) : null}
    </div>
  );
}
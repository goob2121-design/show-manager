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
  pendingCheckoutCreated?: boolean;
  requestedQuantity?: number | null;
  namePresent?: boolean;
  emailPresent?: boolean;
  variationRetrievalSucceeded: boolean;
  variationType: string | null;
  selectedLocationIdMasked: string | null;
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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function CreateSandboxCheckoutLinkButton({ slug }: CreateSandboxCheckoutLinkButtonProps) {
  const [purchaserName, setPurchaserName] = useState("Sandbox Buyer");
  const [purchaserEmail, setPurchaserEmail] = useState("sandbox-buyer@example.com");
  const [ticketCount, setTicketCount] = useState(2);
  const [isCreating, setIsCreating] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutLinkResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<CheckoutDiagnostics | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [squareError, setSquareError] = useState<SquareErrorResponse | null>(null);

  async function handleCreate() {
    const normalizedName = purchaserName.trim();
    const normalizedEmail = purchaserEmail.trim();
    const normalizedCount = Math.max(1, Math.min(20, Math.floor(ticketCount) || 2));

    if (!normalizedName) {
      setErrorMessage("Purchaser name is required.");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setErrorMessage("A valid purchaser email is required.");
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);
    setSquareError(null);
    setDiagnostics(null);

    try {
      const response = await fetch("/api/integrations/square/checkout-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, purchaserName: normalizedName, purchaserEmail: normalizedEmail, ticketCount: normalizedCount }),
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-stone-900">Sandbox Checkout Link</h2>
          <p className="text-sm text-stone-600">Creates a temporary Square-hosted checkout link using StageFlow-supplied purchaser details. Nothing is emailed.</p>
        </div>
        <button type="button" onClick={() => void handleCreate()} disabled={isCreating} className="inline-flex rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60">
          {isCreating ? "Creating..." : "Create Sandbox Checkout Link"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_9rem]">
        <label className="grid gap-1 text-sm font-semibold text-stone-700">Purchaser name<input value={purchaserName} onChange={(event) => setPurchaserName(event.target.value)} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-stone-900" /></label>
        <label className="grid gap-1 text-sm font-semibold text-stone-700">Purchaser email<input type="email" value={purchaserEmail} onChange={(event) => setPurchaserEmail(event.target.value)} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-stone-900" /></label>
        <label className="grid gap-1 text-sm font-semibold text-stone-700">Ticket quantity<input type="number" min={1} max={20} value={ticketCount} onChange={(event) => setTicketCount(Number.parseInt(event.target.value, 10) || 1)} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-stone-900" /></label>
      </div>

      {errorMessage ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <p className="font-bold">{squareError ? "Square Error:" : "Error:"}</p>
          <p className="font-semibold">{errorMessage}</p>
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
          <p><span className="font-semibold">Pending checkout created:</span> {diagnostics.pendingCheckoutCreated ? "yes" : "no"}</p>
          <p><span className="font-semibold">Name present:</span> {diagnostics.namePresent ? "yes" : "no"}</p>
          <p><span className="font-semibold">Email present:</span> {diagnostics.emailPresent ? "yes" : "no"}</p>
          <p><span className="font-semibold">Requested quantity:</span> {diagnostics.requestedQuantity ?? "-"}</p>
          <p><span className="font-semibold">Variation retrieval succeeded:</span> {diagnostics.variationRetrievalSucceeded ? "yes" : "no"}</p>
          <p><span className="font-semibold">Selected location:</span> {diagnostics.selectedLocationIdMasked ?? "-"}</p>
          <p><span className="font-semibold">Catalog-backed attempted:</span> {diagnostics.catalogBackedAttempted ? "yes" : "no"}</p>
          <p><span className="font-semibold">Ad hoc fallback used:</span> {diagnostics.adHocFallbackUsed ? "yes" : "no"}</p>
          <p><span className="font-semibold">Line item:</span> <code>{diagnostics.lineItem ? JSON.stringify(diagnostics.lineItem) : "-"}</code></p>
        </div>
      ) : null}
    </div>
  );
}
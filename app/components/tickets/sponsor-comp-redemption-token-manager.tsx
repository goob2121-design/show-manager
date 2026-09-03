"use client";

import { useState } from "react";

type TokenRow = { id: string; token: string; ordinal: number; redeemed_at: string | null; voided_at: string | null };

export function SponsorCompRedemptionTokenManager({ showId, showSlug, showSponsorId, sponsorName, allowance }: { showId: string; showSlug: string; showSponsorId: string; sponsorName: string; allowance: number }) {
  const [open, setOpen] = useState(false);
  const [expandedTokenId, setExpandedTokenId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function barcodeUrl(tokenId: string, download = false) {
    const query = new URLSearchParams({ slug: showSlug, showSponsorId });
    if (download) query.set("download", "1");
    return `/api/admin/shows/${encodeURIComponent(showId)}/sponsor-comp-redemption-tokens/${encodeURIComponent(tokenId)}/barcode?${query}`;
  }

  function barcodeArchiveUrl() {
    const query = new URLSearchParams({ slug: showSlug, showSponsorId });
    return `/api/admin/shows/${encodeURIComponent(showId)}/sponsor-comp-redemption-tokens/barcodes?${query}`;
  }

  async function loadTokens() {
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ slug: showSlug, showSponsorId });
      const response = await fetch(`/api/admin/shows/${encodeURIComponent(showId)}/sponsor-comp-redemption-tokens?${query}`, { credentials: "same-origin" });
      const payload = await response.json() as { success: boolean; tokens?: TokenRow[]; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error ?? "Unable to load individual redemption barcodes.");
      setTokens(payload.tokens ?? []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load individual redemption barcodes."); }
    finally { setLoading(false); }
  }

  async function toggle() {
    const next = !open; setOpen(next);
    if (next) await loadTokens();
  }

  async function generate() {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/admin/shows/${encodeURIComponent(showId)}/sponsor-comp-redemption-tokens`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: showSlug, showSponsorId }),
      });
      const payload = await response.json() as { success: boolean; tokens?: TokenRow[]; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error ?? "Unable to generate individual redemption barcodes.");
      setTokens(payload.tokens ?? []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to generate individual redemption barcodes."); }
    finally { setLoading(false); }
  }

  const redeemed = tokens.filter((token) => token.redeemed_at).length;
  const available = tokens.filter((token) => !token.redeemed_at && !token.voided_at).length;
  return <div className="mt-2 min-w-64 text-xs">
    <button type="button" onClick={() => void toggle()} className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">{open ? "Hide Individual Barcodes" : "Manage Individual Barcodes"}</button>
    {open ? <div className="mt-2 rounded-lg border border-stone-200 bg-stone-50 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-stone-900">Individual Redemption Barcodes</p>
        {tokens.length > 0 ? (
          <a href={barcodeArchiveUrl()} download className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">Download All {tokens.length} Barcodes</a>
        ) : (
          <button type="button" disabled className="rounded border border-stone-200 bg-stone-100 px-2 py-1 font-semibold text-stone-400">Download All 0 Barcodes</button>
        )}
      </div>
      {loading ? <p className="mt-1 text-stone-500">Loading…</p> : null}
      {error ? <p className="mt-1 text-red-700">{error}</p> : null}
      {!loading && tokens.length === 0 ? <button type="button" onClick={() => void generate()} disabled={allowance <= 0} className="mt-2 rounded-lg bg-emerald-700 px-3 py-1.5 font-bold text-white disabled:opacity-40">Generate {allowance} Individual Barcodes</button> : null}
      {tokens.length > 0 ? <>
        <p className="mt-1 text-stone-600">Issued: {tokens.length} · Redeemed: {redeemed} · Available: {available}</p>
        <ul className="mt-2 max-h-80 space-y-1 overflow-auto">{tokens.map((token) => {
          const expanded = expandedTokenId === token.id;
          const status = token.redeemed_at ? "Redeemed" : token.voided_at ? "Voided" : "Available";
          return <li key={token.id} className="rounded border border-stone-200 bg-white px-2 py-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">Ticket {token.ordinal} of {allowance}</span>
              <span className={token.redeemed_at ? "font-bold text-emerald-700" : token.voided_at ? "font-bold text-red-700" : "text-stone-600"}>{status}</span>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setExpandedTokenId(expanded ? null : token.id)} className="rounded border border-stone-300 px-2 py-1 font-semibold text-stone-700">{expanded ? "Hide Barcode" : "View Barcode"}</button>
                <a href={barcodeUrl(token.id, true)} download className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">Download</a>
              </div>
            </div>
            {expanded ? <div className="mt-3 rounded-lg border border-stone-200 bg-white p-3 text-center">
              <p className="font-bold text-stone-900">{sponsorName} · Ticket {token.ordinal} of {allowance}</p>
              {/* Authenticated dynamic endpoint; a regular img is required for this private barcode response. */}
              <img src={barcodeUrl(token.id)} alt={`Code 128 barcode for ${sponsorName}, ticket ${token.ordinal} of ${allowance}`} className="mx-auto mt-2 h-auto w-full max-w-xl" />
              <p className="mt-2 break-all font-mono text-[11px] text-stone-700">Entry Code: {token.token}</p>
              <p className={`mt-1 font-bold uppercase ${token.redeemed_at ? "text-emerald-700" : token.voided_at ? "text-red-700" : "text-stone-600"}`}>{status}</p>
            </div> : null}
          </li>;
        })}</ul>
      </> : null}
    </div> : null}
  </div>;
}

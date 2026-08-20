"use client";

import { useEffect, useMemo, useState } from "react";

export type SavedDiscountSelection = { code: string; offerText: string; ticketUrl: string };
type SavedCode = {
  id: string; code: string; label: string | null; offer_text: string | null; ticket_url: string | null;
  status: "active" | "inactive"; expires_at: string | null; notes: string | null;
};
type Draft = { code: string; label: string; offerText: string; ticketUrl: string; status: "active" | "inactive"; expiresAt: string; notes: string };
const EMPTY: Draft = { code: "", label: "", offerText: "", ticketUrl: "", status: "active", expiresAt: "", notes: "" };

export function SavedDiscountCodes({ slug, onSelect }: { slug: string; onSelect: (selection: SavedDiscountSelection) => void }) {
  const [codes, setCodes] = useState<SavedCode[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const activeCodes = useMemo(() => codes.filter((item) => item.status === "active" && (!item.expires_at || item.expires_at >= today)), [codes, today]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/admin/email-center/discount-codes?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
        const payload = await response.json() as { success?: boolean; error?: string; codes?: SavedCode[] };
        if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load saved discount codes.");
        if (!cancelled) setCodes(payload.codes ?? []);
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : "Unable to load saved discount codes."); }
    }
    void load();
    return () => { cancelled = true; };
  }, [slug]);

  function choose(id: string) {
    setSelectedId(id);
    const saved = codes.find((item) => item.id === id);
    if (saved) onSelect({ code: saved.code, offerText: saved.offer_text ?? "", ticketUrl: saved.ticket_url ?? "" });
  }
  function edit(saved: SavedCode) {
    setEditingId(saved.id);
    setDraft({ code: saved.code, label: saved.label ?? "", offerText: saved.offer_text ?? "", ticketUrl: saved.ticket_url ?? "", status: saved.status, expiresAt: saved.expires_at ?? "", notes: saved.notes ?? "" });
    setMessage(null);
  }
  function clearDraft() { setEditingId(null); setDraft(EMPTY); }
  async function save() {
    if (saving || !draft.code.trim() || !draft.offerText.trim()) return;
    setSaving(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/email-center/discount-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, action: editingId ? "update" : "create", id: editingId, ...draft }) });
      const payload = await response.json() as { success?: boolean; error?: string; code?: SavedCode };
      if (!response.ok || !payload.success || !payload.code) throw new Error(payload.error || "Unable to save this discount code.");
      setCodes((current) => [payload.code!, ...current.filter((item) => item.id !== payload.code!.id)]);
      setMessage(editingId ? "Saved discount code updated." : "Saved discount code added.");
      clearDraft();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save this discount code."); }
    finally { setSaving(false); }
  }

  return <div className="mt-4 grid gap-4">
    <label className="grid gap-2 text-sm font-semibold">Saved Discount Code
      <select value={selectedId} onChange={(event) => choose(event.target.value)} className="rounded-xl border border-amber-400/30 bg-slate-950 px-3 py-3">
        <option value="">Select a saved code...</option>
        {activeCodes.map((saved) => <option key={saved.id} value={saved.id}>{saved.code}{saved.offer_text ? ` — ${saved.offer_text}` : ""}</option>)}
      </select>
    </label>
    <details className="rounded-xl border border-white/10 bg-black/20 p-4">
      <summary className="cursor-pointer font-bold text-amber-100">Manage Saved Discount Codes</summary>
      <p className="mt-2 text-xs text-slate-400">Email Center reuse only. Discount enforcement is managed separately.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-semibold">Code<input value={draft.code} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))} className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2" /></label>
        <label className="grid gap-1 text-xs font-semibold">Offer<input value={draft.offerText} maxLength={500} onChange={(event) => setDraft((current) => ({ ...current, offerText: event.target.value }))} className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2" /></label>
        <label className="grid gap-1 text-xs font-semibold">Ticket URL<input type="url" value={draft.ticketUrl} onChange={(event) => setDraft((current) => ({ ...current, ticketUrl: event.target.value }))} className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2" /></label>
        <label className="grid gap-1 text-xs font-semibold">Expiration<input type="date" value={draft.expiresAt} onChange={(event) => setDraft((current) => ({ ...current, expiresAt: event.target.value }))} className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2" /></label>
        <label className="grid gap-1 text-xs font-semibold">Label<input value={draft.label} maxLength={200} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2" /></label>
        <label className="grid gap-1 text-xs font-semibold">Status<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Draft["status"] }))} className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label className="grid gap-1 text-xs font-semibold md:col-span-2">Notes<input value={draft.notes} maxLength={2000} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2" /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void save()} disabled={saving || !draft.code.trim() || !draft.offerText.trim()} className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">{saving ? "Saving..." : editingId ? "Update Saved Code" : "Add Saved Code"}</button>{editingId ? <button type="button" onClick={clearDraft} className="rounded-lg border border-white/15 px-3 py-2 text-sm">Cancel Edit</button> : null}</div>
      {message ? <p role="status" className="mt-3 text-sm text-slate-300">{message}</p> : null}
      <div className="mt-4 grid gap-2">{codes.map((saved) => { const expired = Boolean(saved.expires_at && saved.expires_at < today); return <div key={saved.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3 text-sm"><span><strong>{saved.code}</strong> — {saved.offer_text || "No offer"}<small className="ml-2 text-slate-400">{expired ? "Expired" : saved.status === "active" ? "Active" : "Inactive"}</small></span><button type="button" onClick={() => edit(saved)} className="rounded border border-white/15 px-2 py-1">Edit</button></div>; })}</div>
    </details>
  </div>;
}

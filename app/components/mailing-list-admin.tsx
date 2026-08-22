"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
type Subscriber = { id: string; email: string; first_name: string | null; last_name: string | null; status: "active" | "unsubscribed"; source: string; subscribed_at: string; unsubscribed_at: string | null };

export function MailingListAdmin({ slug }: { slug: string }) {
  const [items, setItems] = useState<Subscriber[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "unsubscribed">("all");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/mailing-list?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setItems(payload.subscribers ?? []);
    else setMessage(payload.error ?? "Unable to load subscribers.");
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => items.filter((item) =>
    (statusFilter === "all" || item.status === statusFilter)
    && `${item.first_name ?? ""} ${item.last_name ?? ""} ${item.email}`.toLowerCase().includes(query.toLowerCase()),
  ), [items, query, statusFilter]);

  async function action(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/mailing-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ...body }),
    });
    const payload = await response.json();
    setMessage(response.ok ? "Mailing list updated." : payload.error ?? "Unable to update.");
    if (response.ok) await load();
    return response.ok;
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await action({ action: "add", firstName: data.get("firstName"), lastName: data.get("lastName"), email: data.get("email"), source: "admin" });
    if (event.currentTarget.isConnected) event.currentTarget.reset();
  }

  function startEditing(item: Subscriber) {
    setEditingId(item.id);
    setEditFirstName(item.first_name ?? "");
    setEditLastName(item.last_name ?? "");
  }

  async function saveNames(item: Subscriber) {
    const saved = await action({ action: "update_names", id: item.id, firstName: editFirstName, lastName: editLastName });
    if (saved) setEditingId(null);
  }

  const active = items.filter((item) => item.status === "active").length;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto grid max-w-6xl gap-6">
        <header className="rounded-3xl border border-white/10 bg-slate-900 p-6">
          <Link href={`/admin/${encodeURIComponent(slug)}`} className="text-sm text-amber-300">← Back to Admin</Link>
          <h1 className="mt-3 text-3xl font-black">Mailing List</h1>
          <p className="mt-2 text-slate-400">Global promotional subscribers. Ticket and reserved-seat communications are independent.</p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-5"><p className="text-sm uppercase text-emerald-300">Active</p><p className="text-3xl font-black">{active}</p></div>
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5"><p className="text-sm uppercase text-slate-400">Unsubscribed</p><p className="text-3xl font-black">{items.length - active}</p></div>
        </section>

        <form onSubmit={(event) => void add(event)} className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900 p-5 md:grid-cols-4">
          <input name="firstName" placeholder="First name" className="rounded-xl bg-slate-950 px-3 py-3" />
          <input name="lastName" placeholder="Last name" className="rounded-xl bg-slate-950 px-3 py-3" />
          <input name="email" type="email" required placeholder="Email" className="rounded-xl bg-slate-950 px-3 py-3" />
          <button className="rounded-xl bg-emerald-600 px-4 py-3 font-bold">Add Subscriber</button>
        </form>

        {message ? <p className="rounded-xl bg-sky-500/10 p-3">{message}</p> : null}

        <section className="rounded-2xl border border-white/10 bg-slate-900 p-5">
          <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" className="w-full rounded-xl bg-slate-950 px-3 py-3" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "unsubscribed")} className="rounded-xl bg-slate-950 px-3 py-3">
              <option value="all">All statuses</option><option value="active">Active</option><option value="unsubscribed">Unsubscribed</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-400"><th className="p-2">Name</th><th>Email</th><th>Status</th><th>Source</th><th>Joined</th><th>Unsubscribed</th><th></th></tr></thead>
              <tbody>
                {filtered.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <tr key={item.id} className="border-t border-white/10 align-top">
                      <td className="p-2">
                        {isEditing ? (
                          <div className="grid min-w-56 gap-2 sm:grid-cols-2">
                            <label className="grid gap-1 text-xs text-slate-400">First Name<input aria-label={`First Name for ${item.email}`} value={editFirstName} onChange={(event) => setEditFirstName(event.target.value)} className="rounded-lg border border-white/15 bg-slate-950 px-2.5 py-2 text-sm text-white" /></label>
                            <label className="grid gap-1 text-xs text-slate-400">Last Name<input aria-label={`Last Name for ${item.email}`} value={editLastName} onChange={(event) => setEditLastName(event.target.value)} className="rounded-lg border border-white/15 bg-slate-950 px-2.5 py-2 text-sm text-white" /></label>
                          </div>
                        ) : [item.first_name, item.last_name].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="py-2 pr-3">{item.email}</td>
                      <td className="py-2 pr-3">{item.status}</td>
                      <td className="py-2 pr-3">{item.source}</td>
                      <td className="py-2 pr-3">{new Date(item.subscribed_at).toLocaleDateString()}</td>
                      <td className="py-2 pr-3">{item.unsubscribed_at ? new Date(item.unsubscribed_at).toLocaleDateString() : "—"}</td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-2">
                          {isEditing ? (
                            <>
                              <button type="button" onClick={() => void saveNames(item)} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white">Save</button>
                              <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-white/15 px-3 py-1.5">Cancel</button>
                            </>
                          ) : (
                            <>
                              <button type="button" onClick={() => startEditing(item)} className="rounded-lg border border-white/15 px-3 py-1.5">Edit</button>
                              <button type="button" onClick={() => void action({ action: item.status === "active" ? "unsubscribe" : "reactivate", id: item.id })} className="rounded-lg border border-white/15 px-3 py-1.5">{item.status === "active" ? "Unsubscribe" : "Reactivate"}</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

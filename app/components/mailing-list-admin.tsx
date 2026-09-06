"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveMailingListPresaleTracking, type MailingListPresaleDeliveryEvent } from "@/lib/mailing-list-presale-tracking";
type Subscriber = { id: string; email: string; first_name: string | null; last_name: string | null; status: "active" | "unsubscribed"; source: string; subscribed_at: string; unsubscribed_at: string | null; last_campaign_at?: string | null; created_at?: string; updated_at?: string };
type PresaleDelivery = {
  id: string; recipient: string; send_status: "pending" | "accepted" | "failed"; resend_message_id: string | null;
  delivery_source: "automatic_signup" | "scheduled_campaign" | null;
  error_message: string | null; sent_at: string | null; failed_at: string | null; created_at: string;
  events: MailingListPresaleDeliveryEvent[];
  subscriber: { first_name: string | null; last_name: string | null } | null;
  show: { name: string; show_date: string | null } | null;
};
type PresaleAttempt = {
  id: string; recipient: string; send_status: "pending" | "accepted" | "failed"; resend_message_id: string | null;
  error_message: string | null; sent_at: string | null; failed_at: string | null; requested_at: string;
  administrative_reason: string | null; events: MailingListPresaleDeliveryEvent[];
};
type SubscriberDetailDelivery = PresaleDelivery & {
  show: { id: string; name: string; show_date: string | null; is_archived: boolean; ticket_link: string | null; effective_ticket_sale_status: string } | null;
  attempts: PresaleAttempt[];
};
type SubscriberDetail = { subscriber: Subscriber; presaleDeliveries: SubscriberDetailDelivery[] };

function formatDeliveryDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatShow(delivery: PresaleDelivery) {
  if (!delivery.show) return "—";
  if (!delivery.show.show_date) return delivery.show.name || "—";
  const date = new Date(`${delivery.show.show_date}T12:00:00`);
  const label = Number.isNaN(date.getTime()) ? delivery.show.show_date : new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
  return delivery.show.name ? `${delivery.show.name} · ${label}` : label;
}

function deliveryStatusLabel(status: PresaleDelivery["send_status"]) {
  return status === "accepted" ? "Sent" : status === "failed" ? "Failed" : "Sending";
}

function lifecycleStatusClass(label: string) {
  if (/failed|bounced|spam/i.test(label)) return "bg-rose-500/15 text-rose-200";
  if (/sending|delayed/i.test(label)) return "bg-amber-500/15 text-amber-200";
  return "bg-emerald-500/15 text-emerald-200";
}

function deliverySourceLabel(source: PresaleDelivery["delivery_source"]) {
  return source === "automatic_signup" ? "Automatic signup" : source === "scheduled_campaign" ? "Scheduled campaign" : "Legacy / unknown source";
}

function PresaleLifecycleDetails({ delivery }: { delivery: PresaleDelivery }) {
  const tracking = deriveMailingListPresaleTracking({
    sendStatus: delivery.send_status, sentAt: delivery.sent_at, failedAt: delivery.failed_at,
    events: delivery.events ?? [],
  });
  return <details>
    <summary className="cursor-pointer text-xs font-bold text-sky-200">View lifecycle</summary>
    <div className="mt-2 grid gap-1 rounded-lg bg-white/[0.04] p-2 text-xs text-slate-300">
      <p className="text-slate-400">{deliverySourceLabel(delivery.delivery_source)}</p>
      {tracking.history.length ? tracking.history.map((line, index) => <p key={`${line.label}-${line.timestamp}-${index}`}><span className="font-semibold text-white">{line.label}:</span> {formatDeliveryDate(line.timestamp)}</p>) : <p>{deliveryStatusLabel(delivery.send_status)}: {formatDeliveryDate(delivery.created_at)}</p>}
      {delivery.error_message ? <p className="break-words text-rose-200"><span className="font-semibold">Error:</span> {delivery.error_message}</p> : null}
    </div>
  </details>;
}

function AttemptLifecycle({ attempt }: { attempt: PresaleAttempt }) {
  const tracking = deriveMailingListPresaleTracking({ sendStatus: attempt.send_status, sentAt: attempt.sent_at, failedAt: attempt.failed_at, events: attempt.events ?? [] });
  return <div className="rounded-xl border border-sky-400/20 bg-sky-500/[0.06] p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>Presale Access Resend</strong><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${lifecycleStatusClass(tracking.currentLabel)}`}>{tracking.currentLabel}</span></div>
    <p className="mt-1 break-all text-xs text-slate-400">{attempt.recipient} · Requested {formatDeliveryDate(attempt.requested_at)}</p>
    {attempt.administrative_reason ? <p className="mt-2 text-xs text-slate-300">Reason: {attempt.administrative_reason}</p> : null}
    <div className="mt-2 grid gap-1 text-xs">{tracking.history.map((line, index) => <p key={`${line.label}-${line.timestamp}-${index}`}><span className="font-semibold">{line.label}:</span> {formatDeliveryDate(line.timestamp)}</p>)}</div>
    {attempt.error_message ? <p className="mt-2 text-xs text-rose-200">{attempt.error_message}</p> : null}
  </div>;
}

export function MailingListAdmin({ slug }: { slug: string }) {
  const [items, setItems] = useState<Subscriber[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "unsubscribed">("all");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [presaleDeliveries, setPresaleDeliveries] = useState<PresaleDelivery[]>([]);
  const [presaleQuery, setPresaleQuery] = useState("");
  const [subscriberDetail, setSubscriberDetail] = useState<SubscriberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [resendReason, setResendReason] = useState("Customer reported email missing");
  const resendInFlight = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/mailing-list?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      setItems(payload.subscribers ?? []);
      setPresaleDeliveries(payload.presaleDeliveries ?? []);
    }
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
    const form = event.currentTarget;
    const data = new FormData(form);
    const added = await action({ action: "add", firstName: data.get("firstName"), lastName: data.get("lastName"), email: data.get("email"), source: "admin" });
    if (added && form.isConnected) form.reset();
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

  async function viewSubscriber(subscriberId: string) {
    setDetailLoading(true); setDetailError("");
    try {
      const response = await fetch(`/api/admin/mailing-list/${encodeURIComponent(subscriberId)}?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load subscriber details.");
      setSubscriberDetail({ subscriber: payload.subscriber, presaleDeliveries: payload.presaleDeliveries ?? [] });
    } catch (error) { setDetailError(error instanceof Error ? error.message : "Unable to load subscriber details."); }
    finally { setDetailLoading(false); }
  }

  async function resendPresale(delivery: SubscriberDetailDelivery) {
    const subscriber = subscriberDetail?.subscriber;
    if (!subscriber || !delivery.show || resendInFlight.current) return;
    const confirmed = window.confirm(`Resend current presale access to ${subscriber.email} for ${delivery.show.name}${delivery.show.show_date ? ` on ${delivery.show.show_date}` : ""}?\n\nCurrent status: Presale\nTicket destination: ${delivery.show.ticket_link}`);
    if (!confirmed) return;
    resendInFlight.current = true; setMessage("Sending presale access resend...");
    try {
      const response = await fetch(`/api/admin/mailing-list/${encodeURIComponent(subscriber.id)}/presale-resend`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, deliveryId: delivery.id, requestId: crypto.randomUUID(), reason: resendReason }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to resend presale access.");
      setMessage(payload.status === "duplicate" ? "That resend request was already processed." : "Presale access email resent.");
      await viewSubscriber(subscriber.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to resend presale access."); }
    finally { resendInFlight.current = false; }
  }

  const active = items.filter((item) => item.status === "active").length;
  const presaleSummary = useMemo(() => ({
    sent: presaleDeliveries.filter((item) => item.send_status === "accepted").length,
    failed: presaleDeliveries.filter((item) => item.send_status === "failed").length,
    pending: presaleDeliveries.filter((item) => item.send_status === "pending").length,
  }), [presaleDeliveries]);
  const filteredPresaleDeliveries = useMemo(() => {
    const needle = presaleQuery.trim().toLowerCase();
    if (!needle) return presaleDeliveries;
    return presaleDeliveries.filter((delivery) =>
      `${delivery.subscriber?.first_name ?? ""} ${delivery.subscriber?.last_name ?? ""} ${delivery.recipient}`.toLowerCase().includes(needle));
  }, [presaleDeliveries, presaleQuery]);

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

        <details className="group rounded-2xl border border-white/10 bg-slate-900">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4 marker:hidden">
            <span>
              <span className="block font-bold text-white">Presale Delivery History</span>
              <span className="mt-1 block text-xs text-slate-400">Most recent {presaleDeliveries.length} of 50 maximum</span>
            </span>
            <span className="text-sm font-semibold text-slate-300">
              {presaleSummary.sent} Sent · {presaleSummary.failed} Failed{presaleSummary.pending ? ` · ${presaleSummary.pending} Sending` : ""}
              <span className="ml-3 inline-block transition group-open:rotate-180" aria-hidden="true">⌄</span>
            </span>
          </summary>
          <div className="border-t border-white/10 p-4 sm:p-5">
            <input value={presaleQuery} onChange={(event) => setPresaleQuery(event.target.value)} placeholder="Search presale history by name or email" className="mb-4 w-full rounded-xl bg-slate-950 px-3 py-3 text-sm" />
            {presaleDeliveries.length === 0 ? (
              <p className="text-sm text-slate-400">No presale deliveries have been recorded yet.</p>
            ) : filteredPresaleDeliveries.length === 0 ? (
              <p className="text-sm text-slate-400">No presale deliveries match that name or email.</p>
            ) : (
              <>
                <div className="grid gap-3 md:hidden">
                  {filteredPresaleDeliveries.map((delivery) => {
                    const subscriberName = [delivery.subscriber?.first_name, delivery.subscriber?.last_name].filter(Boolean).join(" ") || "—";
                    const attemptedAt = delivery.sent_at ?? delivery.failed_at ?? delivery.created_at;
                    const tracking = deriveMailingListPresaleTracking({ sendStatus: delivery.send_status, sentAt: delivery.sent_at, failedAt: delivery.failed_at, events: delivery.events ?? [] });
                    return <article key={delivery.id} className="min-w-0 rounded-xl border border-white/10 bg-slate-950 p-4 text-sm">
                      <div className="flex items-start justify-between gap-3"><p className="font-bold text-white">{subscriberName}</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${lifecycleStatusClass(tracking.currentLabel)}`}>{tracking.currentLabel}</span></div>
                      <a href={`mailto:${delivery.recipient}`} className="mt-2 block break-all text-sky-300 underline">{delivery.recipient}</a>
                      <p className="mt-2 text-slate-300">{formatShow(delivery)}</p>
                      <p className="mt-1 text-xs text-slate-400">Accepted / attempted: {formatDeliveryDate(attemptedAt)}</p>
                      <div className="mt-3"><PresaleLifecycleDetails delivery={delivery} /></div>
                    </article>;
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead><tr className="text-slate-400"><th className="p-2">Subscriber</th><th>Email</th><th>Show</th><th>Status</th><th>Sent / Attempted</th><th>Details</th></tr></thead>
                    <tbody>{filteredPresaleDeliveries.map((delivery) => {
                      const subscriberName = [delivery.subscriber?.first_name, delivery.subscriber?.last_name].filter(Boolean).join(" ") || "—";
                      const attemptedAt = delivery.sent_at ?? delivery.failed_at ?? delivery.created_at;
                      const tracking = deriveMailingListPresaleTracking({ sendStatus: delivery.send_status, sentAt: delivery.sent_at, failedAt: delivery.failed_at, events: delivery.events ?? [] });
                      return <tr key={delivery.id} className="border-t border-white/10 align-top">
                        <td className="p-2">{subscriberName}</td>
                        <td className="py-2 pr-3"><a href={`mailto:${delivery.recipient}`} className="break-all text-sky-300 underline">{delivery.recipient}</a></td>
                        <td className="py-2 pr-3">{formatShow(delivery)}</td>
                        <td className="py-2 pr-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${lifecycleStatusClass(tracking.currentLabel)}`}>{tracking.currentLabel}</span></td>
                        <td className="py-2 pr-3">{formatDeliveryDate(attemptedAt)}</td>
                        <td className="py-2"><PresaleLifecycleDetails delivery={delivery} /></td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </details>

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
                          <button type="button" onClick={() => void viewSubscriber(item.id)} className="rounded-lg border border-sky-400/30 px-3 py-1.5 text-sky-200">View</button>
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
      {(subscriberDetail || detailLoading || detailError) ? <div className="fixed inset-0 z-50 flex justify-end bg-black/65" role="dialog" aria-modal="true" aria-label="Mailing list subscriber details">
        <button type="button" aria-label="Close subscriber details" onClick={() => { setSubscriberDetail(null); setDetailError(""); }} className="absolute inset-0 cursor-default" />
        <aside className="relative z-10 h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-slate-950 p-5 shadow-2xl sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Mailing List Subscriber</p><h2 className="mt-2 text-2xl font-black">{subscriberDetail ? [subscriberDetail.subscriber.first_name, subscriberDetail.subscriber.last_name].filter(Boolean).join(" ") || subscriberDetail.subscriber.email : "Subscriber Details"}</h2></div><button type="button" onClick={() => { setSubscriberDetail(null); setDetailError(""); }} className="rounded-xl border border-white/15 px-3 py-2">Close</button></div>
          {detailLoading ? <p className="mt-6 text-slate-400">Loading subscriber details...</p> : null}
          {detailError ? <p className="mt-6 rounded-xl bg-rose-500/10 p-3 text-rose-200">{detailError}</p> : null}
          {subscriberDetail ? <div className="mt-6 grid gap-6">
            <section className="rounded-2xl border border-white/10 bg-slate-900 p-4"><h3 className="font-black">Subscriber</h3><dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"><dt className="text-slate-400">First name</dt><dd>{subscriberDetail.subscriber.first_name || "—"}</dd><dt className="text-slate-400">Last name</dt><dd>{subscriberDetail.subscriber.last_name || "—"}</dd><dt className="text-slate-400">Email</dt><dd className="break-all">{subscriberDetail.subscriber.email}</dd><dt className="text-slate-400">Status</dt><dd>{subscriberDetail.subscriber.status}</dd><dt className="text-slate-400">Source</dt><dd>{subscriberDetail.subscriber.source}</dd><dt className="text-slate-400">Joined</dt><dd>{formatDeliveryDate(subscriberDetail.subscriber.subscribed_at)}</dd><dt className="text-slate-400">Unsubscribed</dt><dd>{formatDeliveryDate(subscriberDetail.subscriber.unsubscribed_at)}</dd><dt className="text-slate-400">Created</dt><dd>{formatDeliveryDate(subscriberDetail.subscriber.created_at ?? null)}</dd><dt className="text-slate-400">Last updated</dt><dd>{formatDeliveryDate(subscriberDetail.subscriber.updated_at ?? null)}</dd><dt className="text-slate-400">Last campaign</dt><dd>{formatDeliveryDate(subscriberDetail.subscriber.last_campaign_at ?? null)}</dd></dl></section>
            <section><h3 className="font-black">Presale Access History</h3><div className="mt-3 grid gap-4">{subscriberDetail.presaleDeliveries.length ? subscriberDetail.presaleDeliveries.map((delivery) => {
              const originalEvents = (delivery.events ?? []).filter((event) => !event.presale_delivery_attempt_id);
              const tracking = deriveMailingListPresaleTracking({ sendStatus: delivery.send_status, sentAt: delivery.sent_at, failedAt: delivery.failed_at, events: originalEvents });
              const resendAllowed = subscriberDetail.subscriber.status === "active" && delivery.show?.effective_ticket_sale_status === "presale" && !delivery.show.is_archived && /^https:\/\//i.test(delivery.show.ticket_link?.trim() ?? "");
              return <article key={delivery.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-bold">{delivery.show?.name ?? "Unknown show"}</h4><p className="text-xs text-slate-400">{delivery.show?.show_date ?? "Date unavailable"} · {deliverySourceLabel(delivery.delivery_source)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${lifecycleStatusClass(tracking.currentLabel)}`}>{tracking.currentLabel}</span></div>
                <p className="mt-3 break-all text-sm text-sky-200">{delivery.recipient}</p><div className="mt-2 grid gap-1 text-xs">{tracking.history.map((line, index) => <p key={`${line.label}-${line.timestamp}-${index}`}><span className="font-semibold">{line.label}:</span> {formatDeliveryDate(line.timestamp)}</p>)}</div>{delivery.error_message ? <p className="mt-2 text-xs text-rose-200">{delivery.error_message}</p> : null}
                <div className="mt-3 grid gap-2">{[...(delivery.attempts ?? [])].sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()).map((attempt) => <AttemptLifecycle key={attempt.id} attempt={attempt} />)}</div>
                <div className="mt-4 border-t border-white/10 pt-4"><label className="grid gap-1 text-xs text-slate-400">Optional resend reason<input value={resendReason} onChange={(event) => setResendReason(event.target.value)} maxLength={500} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" /></label><button type="button" disabled={!resendAllowed} onClick={() => void resendPresale(delivery)} className="mt-3 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Resend Presale Access Email</button>{!resendAllowed ? <p className="mt-2 text-xs text-amber-200">Unavailable unless the subscriber is active and the show is currently in presale with a valid ticket link.</p> : <p className="mt-2 break-all text-xs text-slate-400">Current recipient: {subscriberDetail.subscriber.email}<br />Current status: Presale<br />Ticket destination: {delivery.show?.ticket_link}</p>}</div>
              </article>;
            }) : <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-400">No presale access history for this subscriber.</p>}</div></section>
          </div> : null}
        </aside>
      </div> : null}
    </main>
  );
}

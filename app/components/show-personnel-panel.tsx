"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type {
  PersonnelProfile,
  ShowFinanceItem,
  ShowPayoutItem,
} from "@/lib/types";
import {
  hasPossibleManualPersonnelOverlap,
  normalizePersonnelPayout,
  personnelPayTotals,
} from "@/lib/show-personnel";

type GuestOption = {
  id: string;
  name: string | null;
  instruments: string | null;
};
type Props = {
  showId: string;
  showSlug: string;
  showName: string;
  showDate: string | null;
  manualFinanceItems: ShowFinanceItem[];
  onPersonnelChange: (items: ShowPayoutItem[]) => void;
};
type FormState = {
  sourceId: string;
  name: string;
  role: string;
  amount: string;
};
const emptyForm: FormState = {
  sourceId: "",
  name: "",
  role: "",
  amount: "0.00",
};
const money = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount,
  );
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
        new Date(value + "T12:00:00"),
      )
    : "Date TBD";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );

export function ShowPersonnelPanel(props: Props) {
  const [profiles, setProfiles] = useState<PersonnelProfile[]>([]);
  const [guests, setGuests] = useState<GuestOption[]>([]);
  const [items, setItems] = useState<ShowPayoutItem[]>([]);
  const [regular, setRegular] = useState<FormState>(emptyForm);
  const [guest, setGuest] = useState<FormState>(emptyForm);
  const [custom, setCustom] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    role: "",
    amount: "",
    paid: false,
    paymentMethod: "",
    paymentNote: "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/admin/shows/${props.showId}/personnel?slug=${encodeURIComponent(props.showSlug)}`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as {
      error?: string;
      profiles?: Array<
        PersonnelProfile & { default_pay_amount: number | string }
      >;
      personnel?: Array<
        Omit<ShowPayoutItem, "amount"> & { amount: number | string }
      >;
      guests?: GuestOption[];
    };
    if (!response.ok)
      throw new Error(payload.error || "Unable to load Show Personnel.");
    const nextItems = (payload.personnel ?? []).map(normalizePersonnelPayout);
    setProfiles(
      (payload.profiles ?? []).map((profile) => ({
        ...profile,
        default_pay_amount: Number(profile.default_pay_amount) || 0,
      })),
    );
    setGuests(payload.guests ?? []);
    setItems(nextItems);
    props.onPersonnelChange(nextItems);
  }, [props.showId, props.showSlug, props.onPersonnelChange]);

  useEffect(() => {
    void load().catch((caught) =>
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load Show Personnel.",
      ),
    );
  }, [load]);
  const assignedProfileIds = useMemo(
    () =>
      new Set(items.map((item) => item.personnel_profile_id).filter(Boolean)),
    [items],
  );
  const assignedGuestIds = useMemo(
    () => new Set(items.map((item) => item.guest_profile_id).filter(Boolean)),
    [items],
  );
  const availableProfiles = profiles.filter(
    (profile) => !assignedProfileIds.has(profile.id),
  );
  const availableGuests = guests.filter(
    (option) => !assignedGuestIds.has(option.id),
  );
  const totals = personnelPayTotals(items);

  async function create(
    kind: "regular" | "guest" | "custom",
    form: FormState,
    reset: (value: FormState) => void,
  ) {
    setBusy(`add-${kind}`);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/shows/${props.showId}/personnel?slug=${encodeURIComponent(props.showSlug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            amount: form.amount,
            role: form.role,
            name: form.name,
            personnelProfileId: kind === "regular" ? form.sourceId : undefined,
            guestProfileId: kind === "guest" ? form.sourceId : undefined,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || "Unable to add personnel.");
      reset(emptyForm);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to add personnel.",
      );
    } finally {
      setBusy(null);
    }
  }
  function startEdit(item: ShowPayoutItem) {
    setEditing(item.id);
    setDraft({
      role: item.role_snapshot ?? "",
      amount: item.amount.toFixed(2),
      paid: item.paid,
      paymentMethod: item.payment_method ?? "",
      paymentNote: item.payment_note ?? "",
    });
  }
  async function save(item: ShowPayoutItem, nextPaid = draft.paid) {
    setBusy(item.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/shows/${props.showId}/personnel/${item.id}?slug=${encodeURIComponent(props.showSlug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...draft, paid: nextPaid }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || "Unable to update personnel.");
      setEditing(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update personnel.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function togglePaid(item: ShowPayoutItem) {
    setBusy(item.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/shows/${props.showId}/personnel/${item.id}?slug=${encodeURIComponent(props.showSlug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: item.role_snapshot ?? "",
            amount: item.amount,
            paid: !item.paid,
            paymentMethod: item.payment_method ?? "",
            paymentNote: item.payment_note ?? "",
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || "Unable to update personnel.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update personnel.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function remove(item: ShowPayoutItem) {
    if (
      !window.confirm(`Remove ${item.payee_name} from this show's personnel?`)
    )
      return;
    setBusy(item.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/shows/${props.showId}/personnel/${item.id}?slug=${encodeURIComponent(props.showSlug)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || "Unable to remove personnel.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to remove personnel.",
      );
    } finally {
      setBusy(null);
    }
  }
  function print() {
    const rows = items
      .map(
        (item) =>
          `<tr><td>${escape(item.payee_name)}</td><td>${escape(item.role_snapshot ?? "")}</td><td class="amount">${escape(money(item.amount))}</td><td>${item.paid ? "Yes" : "No"}</td><td>${escape(item.payment_method ?? "")}</td><td class="signature"></td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><title>${escape(props.showName)} - Personnel Pay Sheet</title><style>@page{size:letter;margin:.55in}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111827;margin:0}.logo{display:block;max-width:210px;max-height:78px;margin:0 auto 12px}h1{text-align:center;margin:0;font-size:24px}.meta{text-align:center;color:#4b5563;margin:6px 0 24px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #9ca3af;padding:9px;text-align:left}th{background:#f3f4f6;text-transform:uppercase;font-size:10px;letter-spacing:.08em}.amount{text-align:right;white-space:nowrap}.signature{height:38px;min-width:130px}.totals{margin:18px 0 0 auto;width:280px;border:1px solid #9ca3af;padding:12px}.totals p{display:flex;justify-content:space-between;margin:4px 0}.printed{margin-top:24px;font-size:10px;color:#6b7280}</style></head><body><img class="logo" src="/cmms-logo.png" alt="Cumberland Mountain Music Show logo"><h1>CMMS Personnel Pay Sheet</h1><p class="meta">${escape(props.showName)} · ${escape(date(props.showDate))}</p><table><thead><tr><th>Person</th><th>Role</th><th>Amount</th><th>Paid</th><th>Payment Method</th><th>Signature</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No show personnel added.</td></tr>'}</tbody></table><div class="totals"><p><span>Total Personnel Pay</span><strong>${money(totals.total)}</strong></p><p><span>Paid</span><strong>${money(totals.paid)}</strong></p><p><span>Remaining</span><strong>${money(totals.remaining)}</strong></p></div><p class="printed">Printed: ${escape(new Date().toLocaleString())}</p></body></html>`;
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.onload = () => {
      popup.focus();
      popup.print();
    };
  }

  return (
    <section className="grid gap-5 border-t border-stone-200 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Personnel Pay</h2>
          <p className="text-sm text-stone-600">
            Configure who is working this show and track committed pay.
          </p>
        </div>
        <button
          type="button"
          onClick={print}
          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold"
        >
          Print Personnel Pay Sheet
        </button>
      </div>
      {hasPossibleManualPersonnelOverlap(props.manualFinanceItems) ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Existing manual performer-pay expenses may overlap with Personnel Pay.
          Review Finance entries to avoid counting the same cost twice.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Total", totals.total],
          ["Paid", totals.paid],
          ["Remaining", totals.remaining],
        ].map(([label, value]) => (
          <article
            key={String(label)}
            className="rounded-2xl border border-stone-200 bg-stone-50 p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {money(Number(value))}
            </p>
          </article>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void create("regular", regular, setRegular);
          }}
          className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4"
        >
          <h3 className="font-semibold">Add Regular CMMS Personnel</h3>
          <select
            required
            value={regular.sourceId}
            onChange={(event) => {
              const profile = profiles.find(
                (item) => item.id === event.target.value,
              );
              setRegular({
                sourceId: event.target.value,
                name: "",
                role: profile?.default_role ?? "",
                amount: (profile?.default_pay_amount ?? 0).toFixed(2),
              });
            }}
            className="rounded-lg border p-2"
          >
            <option value="">Choose person</option>
            {availableProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_name}
              </option>
            ))}
          </select>
          <input
            aria-label="Regular personnel role"
            value={regular.role}
            onChange={(e) => setRegular({ ...regular, role: e.target.value })}
            placeholder="Role"
            className="rounded-lg border p-2"
          />
          <input
            aria-label="Regular personnel pay"
            type="number"
            min="0"
            step=".01"
            value={regular.amount}
            onChange={(e) => setRegular({ ...regular, amount: e.target.value })}
            className="rounded-lg border p-2"
          />
          <button
            disabled={busy !== null}
            className="rounded-lg bg-emerald-700 p-2 font-semibold text-white"
          >
            Add Regular Personnel
          </button>
        </form>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void create("guest", guest, setGuest);
          }}
          className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4"
        >
          <h3 className="font-semibold">Add Show Guest</h3>
          <select
            required
            value={guest.sourceId}
            onChange={(event) => {
              const option = guests.find(
                (item) => item.id === event.target.value,
              );
              setGuest({
                sourceId: event.target.value,
                name: "",
                role: option?.instruments ?? "Guest Artist",
                amount: "0.00",
              });
            }}
            className="rounded-lg border p-2"
          >
            <option value="">Choose show guest</option>
            {availableGuests.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name ?? "Unnamed Guest"}
              </option>
            ))}
          </select>
          <input
            aria-label="Show guest role"
            value={guest.role}
            onChange={(e) => setGuest({ ...guest, role: e.target.value })}
            placeholder="Role"
            className="rounded-lg border p-2"
          />
          <input
            aria-label="Show guest pay"
            type="number"
            min="0"
            step=".01"
            value={guest.amount}
            onChange={(e) => setGuest({ ...guest, amount: e.target.value })}
            className="rounded-lg border p-2"
          />
          <button
            disabled={busy !== null}
            className="rounded-lg bg-emerald-700 p-2 font-semibold text-white"
          >
            Add Show Guest
          </button>
        </form>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void create("custom", custom, setCustom);
          }}
          className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4"
        >
          <h3 className="font-semibold">Add Custom Person</h3>
          <input
            required
            value={custom.name}
            onChange={(e) => setCustom({ ...custom, name: e.target.value })}
            placeholder="Name"
            className="rounded-lg border p-2"
          />
          <input
            value={custom.role}
            onChange={(e) => setCustom({ ...custom, role: e.target.value })}
            placeholder="Role"
            className="rounded-lg border p-2"
          />
          <input
            type="number"
            min="0"
            step=".01"
            value={custom.amount}
            onChange={(e) => setCustom({ ...custom, amount: e.target.value })}
            className="rounded-lg border p-2"
          />
          <button
            disabled={busy !== null}
            className="rounded-lg bg-emerald-700 p-2 font-semibold text-white"
          >
            Add Custom Person
          </button>
        </form>
      </div>
      <div className="grid gap-3">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-stone-500">
            No personnel added for this show.
          </p>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-stone-200 bg-white p-4"
            >
              {editing === item.id ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={draft.role}
                    onChange={(e) =>
                      setDraft({ ...draft, role: e.target.value })
                    }
                    aria-label="Edit role"
                    className="rounded-lg border p-2"
                  />
                  <input
                    type="number"
                    min="0"
                    step=".01"
                    value={draft.amount}
                    onChange={(e) =>
                      setDraft({ ...draft, amount: e.target.value })
                    }
                    aria-label="Edit pay"
                    className="rounded-lg border p-2"
                  />
                  <select
                    value={draft.paymentMethod}
                    onChange={(e) =>
                      setDraft({ ...draft, paymentMethod: e.target.value })
                    }
                    aria-label="Payment method"
                    className="rounded-lg border p-2"
                  >
                    <option value="">Payment method</option>
                    {["Cash", "Check", "Venmo", "Other"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                  <input
                    value={draft.paymentNote}
                    onChange={(e) =>
                      setDraft({ ...draft, paymentNote: e.target.value })
                    }
                    aria-label="Payment note"
                    placeholder="Payment note"
                    className="rounded-lg border p-2"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void save(item)}
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-lg border px-3 py-2 text-sm font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{item.payee_name}</h3>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${item.paid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                      >
                        {item.paid ? "Paid" : "Unpaid"}
                      </span>
                    </div>
                    <p className="text-sm text-stone-600">
                      {item.role_snapshot || "Role not set"} ·{" "}
                      {money(item.amount)}
                      {item.payment_method ? ` · ${item.payment_method}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="rounded-lg border px-3 py-2 text-xs font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void togglePaid(item)}
                      disabled={busy === item.id}
                      className="rounded-lg border px-3 py-2 text-xs font-semibold"
                    >
                      {item.paid ? "Mark Unpaid" : "Mark Paid"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(item)}
                      disabled={busy === item.id}
                      className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

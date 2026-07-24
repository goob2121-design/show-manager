"use client";

import { useEffect, useMemo, useState } from "react";

export type SquareImportEventRow = {
  id: string;
  event_id: string | null;
  event_type: string | null;
  payment_id: string | null;
  order_id: string | null;
  line_item_uid: string | null;
  catalog_variation_id: string | null;
  show_id: string | null;
  show_name: string | null;
  result: string;
  ticket_count: number | null;
  email_present: boolean;
  seat_link_created: boolean;
  email_sent: boolean;
  error_message: string | null;
  payload_summary: Record<string, unknown> | null;
  received_at: string;
  imported_at: string | null;
};

type ResultFilter = "all" | "imported" | "duplicates" | "attention";

type EventGroup = {
  key: string;
  events: SquareImportEventRow[];
  orderIds: Set<string>;
  paymentIds: Set<string>;
};

const ATTENTION_RESULTS = new Set(["missing_order", "no_line_items", "incomplete_customer", "failed", "error"]);

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function maskIdentifier(value: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "-";
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function getSummaryString(summary: Record<string, unknown> | null, key: string) {
  const value = summary?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getEventPurchaserName(event: SquareImportEventRow) {
  return getSummaryString(event.payload_summary, "purchaserName")
    ?? getSummaryString(event.payload_summary, "customerName");
}

export function getTicketRelationshipKey(event: Pick<SquareImportEventRow, "payment_id" | "order_id" | "line_item_uid">) {
  const paymentId = event.payment_id?.trim();
  const orderId = event.order_id?.trim();
  const lineItemUid = event.line_item_uid?.trim();
  return paymentId && orderId && lineItemUid ? [paymentId, orderId, lineItemUid].join("|") : null;
}

type NameResolution = {
  displayName: string;
  source: "primary_webhook" | "grouped_webhook" | "related_ticket" | "pending_checkout" | "name_captured" | "unavailable";
  candidates: {
    primaryWebhook: boolean;
    groupedWebhook: boolean;
    relatedTicket: boolean;
    pendingCheckout: boolean;
    nameFoundFlag: boolean;
  };
};

export function resolveGroupedPurchaserName(
  primary: SquareImportEventRow,
  events: SquareImportEventRow[],
  purchaserNamesByTicketKey: Record<string, string> = {},
  purchaserNamesByOrder: Record<string, string> = {},
): NameResolution {
  const primaryName = getEventPurchaserName(primary);
  const groupedName = events
    .filter((event) => event.id !== primary.id)
    .map(getEventPurchaserName)
    .find(Boolean) ?? null;
  const relatedTicketName = events
    .map((event) => {
      const key = getTicketRelationshipKey(event);
      return key ? purchaserNamesByTicketKey[key]?.trim() : "";
    })
    .find(Boolean) ?? null;
  const pendingCheckoutName = events
    .map((event) => event.order_id ? purchaserNamesByOrder[event.order_id]?.trim() : "")
    .find(Boolean) ?? null;
  const nameFoundFlag = events.some((event) => event.payload_summary?.nameFound === true);
  const candidates = {
    primaryWebhook: Boolean(primaryName),
    groupedWebhook: Boolean(groupedName),
    relatedTicket: Boolean(relatedTicketName),
    pendingCheckout: Boolean(pendingCheckoutName),
    nameFoundFlag,
  };

  if (primaryName) return { displayName: primaryName, source: "primary_webhook", candidates };
  if (groupedName) return { displayName: groupedName, source: "grouped_webhook", candidates };
  if (relatedTicketName) return { displayName: relatedTicketName, source: "related_ticket", candidates };
  if (pendingCheckoutName) return { displayName: pendingCheckoutName, source: "pending_checkout", candidates };
  if (nameFoundFlag) return { displayName: "Name captured", source: "name_captured", candidates };
  return { displayName: "Unavailable", source: "unavailable", candidates };
}

export function getGroupedPurchaserName(
  primary: SquareImportEventRow,
  events: SquareImportEventRow[],
  purchaserNamesByTicketKey: Record<string, string> = {},
  purchaserNamesByOrder: Record<string, string> = {},
) {
  return resolveGroupedPurchaserName(primary, events, purchaserNamesByTicketKey, purchaserNamesByOrder).displayName;
}

function getResultClasses(result: string) {
  if (result === "imported") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (result === "duplicate") return "border-stone-200 bg-stone-100 text-stone-600";
  if (result === "incomplete_customer" || result === "missing_order" || result === "no_line_items") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (result === "failed" || result === "error") return "border-red-200 bg-red-50 text-red-800";
  return "border-stone-200 bg-white text-stone-700";
}

function groupEvents(events: SquareImportEventRow[]) {
  const groups: EventGroup[] = [];

  for (const event of events) {
    const orderId = event.order_id?.trim() || null;
    const paymentId = event.payment_id?.trim() || null;
    const matchingGroups = groups.filter(
      (group) => (orderId && group.orderIds.has(orderId)) || (paymentId && group.paymentIds.has(paymentId)),
    );
    const group = matchingGroups[0] ?? {
      key: orderId ? `order:${orderId}` : paymentId ? `payment:${paymentId}` : `event:${event.id}`,
      events: [],
      orderIds: new Set<string>(),
      paymentIds: new Set<string>(),
    };

    if (matchingGroups.length === 0) groups.push(group);
    for (const extraGroup of matchingGroups.slice(1)) {
      group.events.push(...extraGroup.events);
      extraGroup.orderIds.forEach((id) => group.orderIds.add(id));
      extraGroup.paymentIds.forEach((id) => group.paymentIds.add(id));
      groups.splice(groups.indexOf(extraGroup), 1);
    }
    group.events.push(event);
    if (orderId) group.orderIds.add(orderId);
    if (paymentId) group.paymentIds.add(paymentId);
  }

  return groups;
}

export function RecentSquareWebhookResults({
  events,
  purchaserNamesByOrder,
  purchaserNamesByTicketKey,
}: {
  events: SquareImportEventRow[];
  purchaserNamesByOrder: Record<string, string>;
  purchaserNamesByTicketKey: Record<string, string>;
}) {
  const [filter, setFilter] = useState<ResultFilter>("all");
  const groups = useMemo(() => groupEvents(events), [events]);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    for (const group of groups) {
      const primary = group.events.find((event) => event.result === "imported")
        ?? group.events.find((event) => event.result !== "duplicate")
        ?? group.events[0];
      const resolution = resolveGroupedPurchaserName(primary, group.events, purchaserNamesByTicketKey, purchaserNamesByOrder);
      console.info("Square webhook purchaser-name presentation source.", {
        selectedSource: resolution.source,
        ...resolution.candidates,
      });
    }
  }, [groups, purchaserNamesByOrder, purchaserNamesByTicketKey]);

  const filteredGroups = groups.filter((group) => {
    if (filter === "imported") return group.events.some((event) => event.result === "imported");
    if (filter === "duplicates") return group.events.some((event) => event.result === "duplicate");
    if (filter === "attention") return group.events.some((event) => ATTENTION_RESULTS.has(event.result));
    return true;
  });

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold">Recent Square Webhook Results</h2>
        <div className="inline-flex w-full overflow-x-auto rounded-lg border border-stone-200 bg-stone-50 p-1 sm:w-auto">
          {([
            ["all", "All"],
            ["imported", "Imported"],
            ["duplicates", "Duplicates"],
            ["attention", "Needs Attention"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold ${filter === value ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {filteredGroups.map((group) => {
          const primary = group.events.find((event) => event.result === "imported")
            ?? group.events.find((event) => event.result !== "duplicate")
            ?? group.events[0];
          const duplicates = group.events.filter((event) => event.result === "duplicate");
          const attentionEvents = group.events.filter((event) => ATTENTION_RESULTS.has(event.result));
          const purchaserName = getGroupedPurchaserName(primary, group.events, purchaserNamesByTicketKey, purchaserNamesByOrder);

          return (
            <article key={group.key} className="rounded-lg border border-stone-200 bg-white">
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(90px,auto))] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md border px-2 py-1 text-xs font-bold uppercase ${getResultClasses(primary.result)}`}>
                      {primary.result.replaceAll("_", " ")}
                    </span>
                    <span className="text-xs text-stone-500">{maskIdentifier(primary.order_id ?? primary.payment_id)}</span>
                  </div>
                  <p className="mt-2 truncate font-semibold text-stone-900">{purchaserName}</p>
                  <p className="text-sm text-stone-500">{primary.show_name ?? "Show unavailable"}</p>
                </div>
                <div><p className="text-xs font-bold uppercase text-stone-500">Tickets</p><p className="mt-1 font-semibold">{primary.ticket_count ?? "-"}</p></div>
                <div><p className="text-xs font-bold uppercase text-stone-500">Seat Link</p><p className="mt-1 font-semibold">{primary.seat_link_created ? "Created" : "No"}</p></div>
                <div><p className="text-xs font-bold uppercase text-stone-500">Email</p><p className="mt-1 font-semibold">{primary.email_sent ? "Sent" : "No"}</p></div>
                <div><p className="text-xs font-bold uppercase text-stone-500">Received</p><p className="mt-1 text-sm font-semibold">{formatDateTime(primary.received_at)}</p></div>
              </div>

              {(duplicates.length > 0 || attentionEvents.length > 0) ? (
                <div className="border-t border-stone-100 px-4 py-3">
                  {duplicates.length > 0 ? (
                    <p className="text-sm text-stone-500">
                      {duplicates.length} duplicate webhook {duplicates.length === 1 ? "delivery" : "deliveries"} ignored
                    </p>
                  ) : null}
                  {attentionEvents.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {attentionEvents.map((event) => (
                        <span key={event.id} className={`rounded-md border px-2 py-1 text-xs font-semibold ${getResultClasses(event.result)}`}>
                          {event.result.replaceAll("_", " ")}{event.error_message ? `: ${event.error_message}` : ""}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <details className="border-t border-stone-100">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-50">
                  View {group.events.length} webhook {group.events.length === 1 ? "delivery" : "deliveries"}
                </summary>
                <div className="overflow-x-auto border-t border-stone-100">
                  <table className="min-w-full divide-y divide-stone-200 text-sm">
                    <thead className="bg-stone-50 text-left text-xs font-bold uppercase text-stone-500">
                      <tr><th className="px-3 py-2">Received</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Seat Link</th><th className="px-3 py-2">Email</th></tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {group.events.map((event) => (
                        <tr key={event.id}>
                          <td className="whitespace-nowrap px-3 py-2">{formatDateTime(event.received_at)}</td>
                          <td className="px-3 py-2"><span className={`rounded-md border px-2 py-1 text-xs font-semibold ${getResultClasses(event.result)}`}>{event.result}</span></td>
                          <td className="px-3 py-2">{maskIdentifier(event.payment_id)}</td>
                          <td className="px-3 py-2">{maskIdentifier(event.order_id)}</td>
                          <td className="px-3 py-2">{event.ticket_count ?? "-"}</td>
                          <td className="px-3 py-2">{event.seat_link_created ? "Yes" : "No"}</td>
                          <td className="px-3 py-2">{event.email_sent ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </article>
          );
        })}
        {filteredGroups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
            {events.length === 0 ? "No Square webhook events recorded yet." : "No webhook results match this filter."}
          </p>
        ) : null}
      </div>
    </section>
  );
}

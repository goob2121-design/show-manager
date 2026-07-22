import Link from "next/link";
import { AdminGate } from "@/app/components/admin-gate";
import { createServiceRoleSupabaseClient, getSquarePhase1Config, maskIdentifier } from "@/app/api/integrations/square/_lib";
import { CreateSandboxCheckoutLinkButton } from "./create-sandbox-checkout-link-button";
import { DebugLatestImportButton } from "./debug-latest-import-button";

export const runtime = "nodejs";

type PageProps = {
  params: Promise<{ slug: string }>;
};

type SquareImportEventRow = {
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

function getSummaryString(summary: Record<string, unknown> | null, key: string) {
  const value = summary?.[key];
  return typeof value === "string" ? value : null;
}

function getSummaryBoolean(summary: Record<string, unknown> | null, key: string) {
  return summary?.[key] === true;
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

export default async function SquareIntegrationStatusPage({ params }: PageProps) {
  const { slug } = await params;
  const { config, missing, invalid } = getSquarePhase1Config();
  const supabase = createServiceRoleSupabaseClient();
  const [{ data: show }, { data: events }] = await Promise.all([
    supabase.from("shows").select("id, name, slug, square_catalog_variation_id").eq("slug", slug).maybeSingle(),
    supabase
      .from("square_ticket_import_events")
      .select("id, event_id, event_type, payment_id, order_id, line_item_uid, catalog_variation_id, show_id, show_name, result, ticket_count, email_present, seat_link_created, email_sent, error_message, payload_summary, received_at, imported_at")
      .order("received_at", { ascending: false })
      .limit(25),
  ]);

  const typedShow = show as { id: string; name: string; slug: string; square_catalog_variation_id: string | null } | null;
  const typedEvents = (events ?? []) as SquareImportEventRow[];
  const lastWebhookAt = typedEvents[0]?.received_at ?? null;
  const lastSuccessfulImportAt = typedEvents.find((event) => ["imported", "duplicate", "incomplete_customer"].includes(event.result))?.imported_at ?? null;
  const latestImportEvent = typedEvents[0] ?? null;

  return (
    <AdminGate slug={slug} resourceLabel="Square integration status" continueLabel="Continue to Square Integration">
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900">
        <div className="mx-auto grid max-w-6xl gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Sandbox Only</p>
              <h1 className="text-3xl font-black">Square Integration Status</h1>
              <p className="mt-1 text-sm text-stone-600">Sanitized Phase 1 webhook/import visibility. Purchaser emails are not sent.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/${encodeURIComponent(slug)}/square-catalog`} className="inline-flex rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">View Square Catalog</Link>
              <Link href={`/admin/${encodeURIComponent(slug)}`} className="inline-flex rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">Back to Admin</Link>
            </div>
          </div>

          <CreateSandboxCheckoutLinkButton slug={slug} />
          {config?.environment === "sandbox" ? <DebugLatestImportButton paymentId={latestImportEvent?.payment_id ?? null} orderId={latestImportEvent?.order_id ?? null} /> : null}

          <section className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Mode</p><p className="mt-1 text-lg font-semibold">{config?.environment ?? "Not configured"}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Required Config</p><p className="mt-1 text-lg font-semibold">{config ? "Present" : "Missing"}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Last Webhook</p><p className="mt-1 text-lg font-semibold">{formatDateTime(lastWebhookAt)}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Last Import</p><p className="mt-1 text-lg font-semibold">{formatDateTime(lastSuccessfulImportAt)}</p></div>
          </section>

          {missing.length > 0 || invalid.length > 0 ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <p className="font-bold">Configuration needs attention.</p>
              {missing.length > 0 ? <p className="mt-2">Missing: {missing.join(", ")}</p> : null}
              {invalid.length > 0 ? <p className="mt-2">Invalid: {invalid.join(", ")}</p> : null}
            </section>
          ) : null}

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Show Mapping</h2>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div><p className="font-semibold text-stone-500">Show</p><p>{typedShow?.name ?? slug}</p></div>
              <div><p className="font-semibold text-stone-500">Slug</p><p>{slug}</p></div>
              <div><p className="font-semibold text-stone-500">Square Catalog Variation</p><p>{typedShow?.square_catalog_variation_id ? maskIdentifier(typedShow.square_catalog_variation_id) : "Not assigned"}</p></div>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Recent Square Webhook Results</h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200">
              <table className="min-w-full divide-y divide-stone-200 text-sm">
                <thead className="bg-stone-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
                  <tr><th className="px-3 py-2">Received</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Show</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Name?</th><th className="px-3 py-2">Email?</th><th className="px-3 py-2">Customer Source</th><th className="px-3 py-2">Seat Link?</th><th className="px-3 py-2">Email Sent</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {typedEvents.length > 0 ? typedEvents.map((event) => (
                    <tr key={event.id}>
                      <td className="px-3 py-2">{formatDateTime(event.received_at)}</td>
                      <td className="px-3 py-2 font-semibold">{event.result}</td>
                      <td className="px-3 py-2">{maskIdentifier(event.order_id) ?? "-"}</td>
                      <td className="px-3 py-2">{event.show_name ?? "-"}</td>
                      <td className="px-3 py-2">{event.ticket_count ?? "-"}</td>
                      <td className="px-3 py-2">{getSummaryBoolean(event.payload_summary, "nameFound") ? "Yes" : "No"}</td>
                      <td className="px-3 py-2">{event.email_present || getSummaryBoolean(event.payload_summary, "emailFound") ? "Yes" : "No"}</td>
                      <td className="px-3 py-2">{getSummaryString(event.payload_summary, "customerSource") ?? "unavailable"}</td>
                      <td className="px-3 py-2">{event.seat_link_created ? "Yes" : "No"}</td>
                      <td className="px-3 py-2">{event.email_sent ? "Yes" : "No"}</td>
                    </tr>
                  )) : (
                    <tr><td className="px-3 py-5 text-stone-500" colSpan={10}>No Square webhook events recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </AdminGate>
  );
}
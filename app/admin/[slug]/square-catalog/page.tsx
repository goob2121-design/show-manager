import Link from "next/link";
import { AdminGate } from "@/app/components/admin-gate";
import {
  getSquareSandboxCatalogConfig,
  getSquareTokenFingerprint,
  listSquareCatalogItems,
  listSquareLocations,
  retrieveSquareMerchant,
  type SquareCatalogItem,
  type SquareCatalogVariation,
} from "@/app/api/integrations/square/_lib";
import { CopyVariationIdButton } from "./copy-variation-id-button";
export const runtime = "nodejs";

type PageProps = {
  params: Promise<{ slug: string }>;
};

type CatalogVariationRow = {
  itemName: string;
  itemId: string;
  variationName: string;
  variationId: string;
  price: string;
  currency: string;
  archivedStatus: string;
  presentAtLocationStatus: string;
};

function formatMoney(amount: number | undefined, currency: string | undefined) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return { price: "Variable", currency: currency ?? "-" };
  }

  const resolvedCurrency = currency ?? "USD";
  return {
    price: new Intl.NumberFormat("en-US", { style: "currency", currency: resolvedCurrency }).format(amount / 100),
    currency: resolvedCurrency,
  };
}

function formatPresence(item: SquareCatalogItem, variation: SquareCatalogVariation) {
  if (variation.present_at_all_locations ?? item.present_at_all_locations) return "All locations";
  const locationIds = variation.present_at_location_ids ?? item.present_at_location_ids ?? [];
  if (locationIds.length === 0) return "Not specified";
  return `${locationIds.length} specific location${locationIds.length === 1 ? "" : "s"}`;
}

function buildRows(items: SquareCatalogItem[]) {
  return items.flatMap<CatalogVariationRow>((item) => {
    const itemName = item.item_data?.name?.trim() || "Unnamed item";
    const itemId = item.id ?? "";
    const variations = item.item_data?.variations ?? [];

    if (variations.length === 0) {
      return [{ itemName, itemId, variationName: "No variations", variationId: "", price: "-", currency: "-", archivedStatus: item.is_deleted ? "Archived" : "Active", presentAtLocationStatus: formatPresence(item, {}) }];
    }

    return variations.map((variation) => {
      const money = formatMoney(variation.item_variation_data?.price_money?.amount, variation.item_variation_data?.price_money?.currency);
      return {
        itemName,
        itemId,
        variationName: variation.item_variation_data?.name?.trim() || "Unnamed variation",
        variationId: variation.id ?? "",
        price: money.price,
        currency: money.currency,
        archivedStatus: item.is_deleted || variation.is_deleted ? "Archived" : "Active",
        presentAtLocationStatus: formatPresence(item, variation),
      };
    });
  });
}

export default async function SquareCatalogPage({ params }: PageProps) {
  const { slug } = await params;
  const { config, missing, invalid } = getSquareSandboxCatalogConfig();
  let rows: CatalogVariationRow[] = [];
  let errorMessage: string | null = null;

  if (config) {
    try {
      const [items, locations, merchant] = await Promise.all([listSquareCatalogItems(config), listSquareLocations(config), retrieveSquareMerchant(config)]);
      rows = buildRows(items);
      console.info("Square catalog page diagnostics", {
        environment: config.environment,
        apiBaseUrl: config.apiBaseUrl,
        squareVersion: "2026-07-15",
        tokenFingerprint: getSquareTokenFingerprint(config),
        merchantId: merchant?.id ?? null,
        locationIds: locations.map((location) => location.id).filter(Boolean),
        catalogItemIds: items.map((item) => item.id).filter(Boolean),
        catalogVariationIds: rows.map((row) => row.variationId).filter(Boolean),
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unable to load Square Sandbox catalog.";
    }
  }

  return (
    <AdminGate slug={slug} resourceLabel="Square Sandbox catalog" continueLabel="Continue to Square Catalog">
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900">
        <div className="mx-auto grid max-w-7xl gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Square Sandbox</p>
              <h1 className="text-3xl font-black">Square Catalog</h1>
              <p className="mt-1 text-sm text-stone-600">View items and copy the Catalog Variation ID used for StageFlow show mapping.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/${encodeURIComponent(slug)}/square-integration`} className="inline-flex rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">Square Integration Status</Link>
              <Link href={`/admin/${encodeURIComponent(slug)}`} className="inline-flex rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">Back to Admin</Link>
            </div>
          </div>

          {missing.length > 0 || invalid.length > 0 ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <p className="font-bold">Square Sandbox catalog is not configured.</p>
              {missing.length > 0 ? <p className="mt-2">Missing: {missing.join(", ")}</p> : null}
              {invalid.length > 0 ? <p className="mt-2">Invalid: {invalid.join(", ")}</p> : null}
            </section>
          ) : null}

          {errorMessage ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">{errorMessage}</section>
          ) : null}

          {!config || errorMessage ? null : rows.length === 0 ? (
            <section className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-600 shadow-sm">No Square Sandbox catalog items found.</section>
          ) : (
            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">Catalog Items And Variations</h2>
              <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200">
                <table className="min-w-full divide-y divide-stone-200 text-sm">
                  <thead className="bg-stone-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
                    <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Item ID</th><th className="px-3 py-2">Variation</th><th className="px-3 py-2">Use this Variation ID for StageFlow mapping</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Currency</th><th className="px-3 py-2">Archived</th><th className="px-3 py-2">Present At Location</th><th className="px-3 py-2">Copy</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {rows.map((row) => (
                      <tr key={`${row.itemId}-${row.variationId || row.variationName}`}>
                        <td className="px-3 py-2 font-semibold text-stone-900">{row.itemName}</td>
                        <td className="px-3 py-2 font-mono text-xs text-stone-700">{row.itemId}</td>
                        <td className="px-3 py-2">{row.variationName}</td>
                        <td className="px-3 py-2 font-mono text-xs font-bold text-emerald-800">{row.variationId || "-"}</td>
                        <td className="px-3 py-2">{row.price}</td>
                        <td className="px-3 py-2">{row.currency}</td>
                        <td className="px-3 py-2">{row.archivedStatus}</td>
                        <td className="px-3 py-2">{row.presentAtLocationStatus}</td>
                        <td className="px-3 py-2">{row.variationId ? <CopyVariationIdButton variationId={row.variationId} /> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
    </AdminGate>
  );
}

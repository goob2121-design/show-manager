import type { SupabaseClient } from "@supabase/supabase-js";

export const SQUARE_FINANCE_SOURCE = "square";
export const SQUARE_GROSS_SALE_SOURCE_KIND = "gross_sale";
export const SQUARE_FINANCE_UNIQUE_COLUMNS = [
  "source",
  "source_kind",
  "show_id",
  "external_payment_id",
  "external_order_id",
  "external_line_item_uid",
].join(",");

export type SquareGrossSaleFinanceInput = {
  showId: string | null;
  paymentStatus: string;
  paymentId: string;
  orderId: string;
  lineItemUid: string;
  amountCents: number | null;
  currency: string | null;
  occurredAt: string | null;
};

export type SquareGrossSaleFinanceResult =
  | { status: "synced"; financeItemId: string | null }
  | {
      status: "skipped";
      reason: "unmapped_show" | "payment_not_completed" | "sync_disabled" | "before_cutoff" | "missing_amount";
    };

type SquareFinanceShow = {
  id: string;
  square_finance_sync_enabled: boolean;
  square_finance_sync_started_at: string | null;
};

function hasReachedCutoff(occurredAt: string | null, cutoff: string | null) {
  if (!occurredAt || !cutoff) return false;
  const occurredTime = Date.parse(occurredAt);
  const cutoffTime = Date.parse(cutoff);
  return Number.isFinite(occurredTime) && Number.isFinite(cutoffTime) && occurredTime >= cutoffTime;
}

export function buildSquareGrossSaleFinanceRow(input: SquareGrossSaleFinanceInput, importedAt: string) {
  if (!input.showId || input.amountCents === null) return null;
  return {
    show_id: input.showId,
    type: "income",
    category: "Presale Tickets",
    label: "Square Presale",
    amount: input.amountCents / 100,
    notes: [
      "Square-managed gross presale.",
      `Payment: ${input.paymentId}`,
      `Order: ${input.orderId}`,
      `Line item: ${input.lineItemUid}`,
    ].join("\n"),
    source: SQUARE_FINANCE_SOURCE,
    source_kind: SQUARE_GROSS_SALE_SOURCE_KIND,
    external_payment_id: input.paymentId,
    external_order_id: input.orderId,
    external_line_item_uid: input.lineItemUid,
    currency: input.currency?.trim().toUpperCase() || null,
    original_amount_cents: input.amountCents,
    occurred_at: input.occurredAt,
    imported_at: importedAt,
    is_system_managed: true,
  };
}

export async function syncSquareGrossSaleFinance(
  supabase: SupabaseClient,
  input: SquareGrossSaleFinanceInput,
): Promise<SquareGrossSaleFinanceResult> {
  if (!input.showId) return { status: "skipped", reason: "unmapped_show" };
  if (input.paymentStatus !== "COMPLETED") return { status: "skipped", reason: "payment_not_completed" };
  if (input.amountCents === null || !Number.isSafeInteger(input.amountCents) || input.amountCents < 0) {
    return { status: "skipped", reason: "missing_amount" };
  }

  const { data: show, error: showError } = await supabase
    .from("shows")
    .select("id, square_finance_sync_enabled, square_finance_sync_started_at")
    .eq("id", input.showId)
    .maybeSingle();
  if (showError) throw showError;

  const typedShow = show as SquareFinanceShow | null;
  if (!typedShow?.square_finance_sync_enabled) return { status: "skipped", reason: "sync_disabled" };
  if (!hasReachedCutoff(input.occurredAt, typedShow.square_finance_sync_started_at)) {
    return { status: "skipped", reason: "before_cutoff" };
  }

  const importedAt = new Date().toISOString();
  const row = buildSquareGrossSaleFinanceRow(input, importedAt);
  if (!row) return { status: "skipped", reason: "missing_amount" };

  const { data, error } = await supabase
    .from("show_finance_items")
    .upsert(row, { onConflict: SQUARE_FINANCE_UNIQUE_COLUMNS, ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (error) throw error;

  return { status: "synced", financeItemId: (data as { id?: string } | null)?.id ?? null };
}

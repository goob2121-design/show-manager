import type { SupabaseClient } from "@supabase/supabase-js";
import type { SquareOrder, SquareOrderLineItem } from "@/app/api/integrations/square/_lib";

export type SquarePendingCheckout = {
  id: string;
  show_id: string;
  environment: "sandbox";
  square_payment_link_id: string | null;
  square_order_id: string | null;
  square_payment_id: string | null;
  purchaser_name: string;
  purchaser_email: string;
  ticket_count: number;
  catalog_variation_id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  imported_ticket_id: string | null;
  sanitized_error: string | null;
};

export type PendingCheckoutValidation = {
  purchaserName: string;
  purchaserEmail: string;
  ticketCount: number;
};

export function normalizePendingCheckoutInput(input: { purchaserName?: unknown; purchaserEmail?: unknown; ticketCount?: unknown }): PendingCheckoutValidation | { error: string } {
  const purchaserName = typeof input.purchaserName === "string" ? input.purchaserName.trim() : "";
  const purchaserEmail = typeof input.purchaserEmail === "string" ? input.purchaserEmail.trim() : "";
  const rawTicketCount = typeof input.ticketCount === "number" ? input.ticketCount : Number.parseInt(String(input.ticketCount ?? "2"), 10);
  const ticketCount = Number.isFinite(rawTicketCount) ? Math.floor(rawTicketCount) : 0;

  if (!purchaserName) return { error: "Purchaser name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(purchaserEmail)) return { error: "A valid purchaser email is required." };
  if (ticketCount < 1 || ticketCount > 20) return { error: "Ticket quantity must be between 1 and 20." };

  return { purchaserName, purchaserEmail, ticketCount };
}

export async function createSquarePendingCheckout(supabase: SupabaseClient, input: {
  showId: string;
  purchaserName: string;
  purchaserEmail: string;
  ticketCount: number;
  catalogVariationId: string;
}) {
  const { data, error } = await supabase
    .from("square_pending_checkouts")
    .insert({
      show_id: input.showId,
      environment: "sandbox",
      purchaser_name: input.purchaserName,
      purchaser_email: input.purchaserEmail,
      ticket_count: input.ticketCount,
      catalog_variation_id: input.catalogVariationId,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as SquarePendingCheckout;
}

export async function attachSquarePaymentLinkToPendingCheckout(supabase: SupabaseClient, pendingId: string, input: { paymentLinkId: string | null; orderId: string | null }) {
  const { error } = await supabase
    .from("square_pending_checkouts")
    .update({ square_payment_link_id: input.paymentLinkId, square_order_id: input.orderId })
    .eq("id", pendingId);
  if (error) throw error;
}

export async function markSquarePendingCheckoutError(supabase: SupabaseClient, pendingId: string, sanitizedError: string) {
  const { error } = await supabase
    .from("square_pending_checkouts")
    .update({ status: "error", sanitized_error: sanitizedError })
    .eq("id", pendingId);
  if (error) throw error;
}

export async function markSquarePendingCheckoutCompleted(supabase: SupabaseClient, pendingId: string, input: { paymentId: string; orderId: string; importedTicketId: string | null }) {
  const { error } = await supabase
    .from("square_pending_checkouts")
    .update({
      square_payment_id: input.paymentId,
      square_order_id: input.orderId,
      imported_ticket_id: input.importedTicketId,
      status: "completed",
      completed_at: new Date().toISOString(),
      sanitized_error: null,
    })
    .eq("id", pendingId);
  if (error) throw error;
}

export async function findSquarePendingCheckout(supabase: SupabaseClient, input: { orderId: string | null; paymentId: string | null; referenceId: string | null }) {
  const candidates: Array<{ column: string; value: string | null }> = [
    { column: "square_order_id", value: input.orderId },
    { column: "id", value: input.referenceId },
    { column: "square_payment_id", value: input.paymentId },
  ];

  for (const candidate of candidates) {
    if (!candidate.value) continue;
    const { data, error } = await supabase
      .from("square_pending_checkouts")
      .select("*")
      .eq(candidate.column, candidate.value)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as SquarePendingCheckout;
  }

  return null;
}

export function getMatchingSquareLineItem(order: SquareOrder | null, catalogVariationId: string): SquareOrderLineItem | null {
  return order?.line_items?.find((lineItem) => lineItem.catalog_object_id?.trim() === catalogVariationId) ?? null;
}

export function getSquareLineItemQuantity(lineItem: SquareOrderLineItem | null) {
  const parsed = Number.parseInt(lineItem?.quantity ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function buildSquarePendingReference(pendingId: string) {
  return pendingId;
}
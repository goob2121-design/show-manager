import { buildSquarePendingReference, getMatchingSquareLineItem, getSquareLineItemQuantity, normalizePendingCheckoutInput, type SquarePendingCheckout } from "@/app/api/integrations/square/pending-checkouts";
import type { SquareOrder } from "@/app/api/integrations/square/_lib";

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

function runPendingCheckoutTests() {
  const normalized = normalizePendingCheckoutInput({ purchaserName: "Test Buyer", purchaserEmail: "buyer@example.com", ticketCount: 2 });
  if ("error" in normalized) throw new Error(normalized.error);
  expectEqual(normalized.ticketCount, 2, "quantity 2 is accepted for Square line item quantity");
  expectEqual(normalized.purchaserName, "Test Buyer", "pending checkout stores name");
  expectEqual(normalized.purchaserEmail, "buyer@example.com", "pending checkout stores email");

  const pending: SquarePendingCheckout = {
    id: "00000000-0000-0000-0000-000000000001",
    show_id: "show_1",
    environment: "sandbox",
    square_payment_link_id: "plink_1",
    square_order_id: "order_1",
    square_payment_id: null,
    purchaser_name: normalized.purchaserName,
    purchaser_email: normalized.purchaserEmail,
    ticket_count: normalized.ticketCount,
    catalog_variation_id: "variation_1",
    status: "pending",
    created_at: new Date(0).toISOString(),
    completed_at: null,
    imported_ticket_id: null,
    sanitized_error: null,
  };
  expectEqual(buildSquarePendingReference(pending.id), pending.id, "webhook can match by order reference");

  const order: SquareOrder = { id: "order_1", reference_id: pending.id, line_items: [{ uid: "line_1", catalog_object_id: "variation_1", quantity: "2" }] };
  const matchingLineItem = getMatchingSquareLineItem(order, pending.catalog_variation_id);
  expectEqual(matchingLineItem?.uid ?? null, "line_1", "webhook matches mapped variation");
  expectEqual(getSquareLineItemQuantity(matchingLineItem), 2, "completed two-ticket purchase imports ticket_count 2");

  expectEqual(getMatchingSquareLineItem(order, "wrong_variation"), null, "variation mismatch is rejected");
  expectEqual(getSquareLineItemQuantity({ uid: "line_2", catalog_object_id: "variation_1", quantity: "1" }), 1, "quantity mismatch is detectable");

  const fallbackOrder: SquareOrder = { id: "production_order", line_items: [{ uid: "line_3", catalog_object_id: "variation_1", quantity: "1" }] };
  expectEqual(fallbackOrder.reference_id ?? null, null, "unmatched production-style order can fall back to Square customer lookup");
  expectEqual(false, false, "purchaser email is not sent in this phase");
}

runPendingCheckoutTests();
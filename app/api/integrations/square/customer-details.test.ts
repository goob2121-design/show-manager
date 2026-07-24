import { getSquareOrderCustomerId, getSquareOrderRecipientMatches, resolveSquarePurchaserDetails } from "@/app/api/integrations/square/customer-details";
import type { SquareCustomer, SquareOrder, SquarePayment } from "@/app/api/integrations/square/_lib";

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

function runCustomerDetailResolverTests() {
  const payment: SquarePayment = { id: "pay_1", status: "COMPLETED", order_id: "order_1", buyer_email_address: "payment@example.com" };

  const pickupOrder: SquareOrder = {
    id: "order_1",
    line_items: [{ uid: "line_1", catalog_object_id: "var_1", quantity: "3" }],
    fulfillments: [{ pickup_details: { recipient: { display_name: "Jane Doe", email_address: "jane.doe@example.com", phone_number: "555-111-2222" } } }],
  };
  const pickupResult = resolveSquarePurchaserDetails({ payment, order: pickupOrder, customer: null });
  expectEqual(pickupResult.purchaserName, "Jane Doe", "pickup fulfillment name");
  expectEqual(pickupResult.purchaserEmail, "jane.doe@example.com", "pickup fulfillment email");
  expectEqual(pickupResult.customerSource, "order_fulfillment", "pickup fulfillment source");

  const shipmentOrder: SquareOrder = {
    id: "order_ship",
    fulfillments: [{ shipment_details: { recipient: { display_name: "Ship Person", email_address: "ship@example.com", phone_number: "555-222-3333" } } }],
  };
  const shipmentResult = resolveSquarePurchaserDetails({ payment: null, order: shipmentOrder, customer: null });
  expectEqual(shipmentResult.purchaserName, "Ship Person", "shipment fulfillment name");
  expectEqual(shipmentResult.purchaserEmail, "ship@example.com", "shipment fulfillment email");
  expectEqual(shipmentResult.customerSource, "order_fulfillment", "shipment fulfillment source");

  const deliveryOrder: SquareOrder = {
    id: "order_delivery",
    fulfillments: [{ delivery_details: { recipient: { display_name: "Delivery Person", email_address: "delivery@example.com", phone_number: "555-444-5555" } } }],
  };
  const deliveryResult = resolveSquarePurchaserDetails({ payment: null, order: deliveryOrder, customer: null });
  expectEqual(deliveryResult.purchaserName, "Delivery Person", "delivery fulfillment name");
  expectEqual(deliveryResult.purchaserEmail, "delivery@example.com", "delivery fulfillment email");
  expectEqual(deliveryResult.customerSource, "order_fulfillment", "delivery fulfillment source");

  const multipleOrder: SquareOrder = {
    id: "order_multi",
    fulfillments: [
      { pickup_details: {} },
      { shipment_details: { recipient: { display_name: "Second Fulfillment", email_address: "second@example.com" } } },
    ],
  };
  const multipleMatches = getSquareOrderRecipientMatches(multipleOrder);
  const multipleResult = resolveSquarePurchaserDetails({ payment: null, order: multipleOrder, customer: null });
  expectEqual(multipleMatches.length, 1, "multiple fulfillment match count");
  expectEqual(multipleResult.purchaserName, "Second Fulfillment", "multiple fulfillment name");
  expectEqual(multipleResult.purchaserEmail, "second@example.com", "multiple fulfillment email");

  const customer: SquareCustomer = { id: "cus_1", given_name: "Bryan", family_name: "Turner", email_address: "bryan@example.com", phone_number: "555-333-4444" };
  const customerOrder: SquareOrder = { id: "order_2", customer_id: "cus_1", line_items: [{ uid: "line_2", catalog_object_id: "var_1", quantity: "5" }] };
  const customerResult = resolveSquarePurchaserDetails({ payment: { id: "pay_2", status: "COMPLETED", order_id: "order_2" }, order: customerOrder, customer });
  expectEqual(customerResult.purchaserName, "Bryan Turner", "customer name");
  expectEqual(customerResult.purchaserEmail, "bryan@example.com", "customer email");
  expectEqual(customerResult.customerSource, "square_customer", "customer source");
  expectEqual(getSquareOrderCustomerId(customerOrder, null), "cus_1", "order customer id");

  const mixedOrder: SquareOrder = { id: "order_3", customer_id: "cus_1", fulfillments: [{ pickup_details: { recipient: { display_name: "Will Call Name" } } }] };
  const mixedResult = resolveSquarePurchaserDetails({ payment: null, order: mixedOrder, customer });
  expectEqual(mixedResult.purchaserName, "Will Call Name", "mixed fulfillment name");
  expectEqual(mixedResult.purchaserEmail, "bryan@example.com", "mixed customer email");
  expectEqual(mixedResult.customerSource, "order_fulfillment", "mixed source");

  const noRecipientOrder: SquareOrder = { id: "order_no_recipient", fulfillments: [{ pickup_details: {} }] };
  const noRecipientResult = resolveSquarePurchaserDetails({ payment: { id: "pay_5", status: "COMPLETED", order_id: "order_no_recipient", buyer_email_address: "fallback@example.com" }, order: noRecipientOrder, customer: null });
  expectEqual(noRecipientResult.purchaserName, "Square Customer", "no recipient fallback name");
  expectEqual(noRecipientResult.purchaserEmail, "fallback@example.com", "no recipient payment email fallback");
  expectEqual(noRecipientResult.customerSource, "payment_or_order", "no recipient fallback source");

  const paymentCardholderResult = resolveSquarePurchaserDetails({
    payment: { id: "pay_card", status: "COMPLETED", card_details: { card: { cardholder_name: "Production Buyer" } } },
    order: { id: "order_card" },
    customer: null,
  });
  expectEqual(paymentCardholderResult.purchaserName, "Production Buyer", "payment cardholder name");
  expectEqual(paymentCardholderResult.customerSource, "payment_or_order", "payment cardholder source");

  const tenderCardholderResult = resolveSquarePurchaserDetails({
    payment: { id: "pay_tender", status: "COMPLETED" },
    order: { id: "order_tender", tenders: [{ card_details: { card: { cardholder_name: "Tender Buyer" } } }] },
    customer: null,
  });
  expectEqual(tenderCardholderResult.purchaserName, "Tender Buyer", "order tender cardholder name");
  expectEqual(tenderCardholderResult.customerSource, "payment_or_order", "order tender cardholder source");
  const incompleteResult = resolveSquarePurchaserDetails({ payment: { id: "pay_4", status: "COMPLETED", order_id: "order_4" }, order: { id: "order_4" }, customer: null });
  expectEqual(incompleteResult.purchaserName, "Square Customer", "incomplete fallback name");
  expectEqual(incompleteResult.purchaserEmail, null, "incomplete email");
  expectEqual(incompleteResult.customerSource, "unavailable", "incomplete source");
}

runCustomerDetailResolverTests();
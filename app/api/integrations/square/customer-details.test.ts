import { resolveSquarePurchaserDetails, getSquareOrderCustomerId } from "@/app/api/integrations/square/customer-details";
import type { SquareCustomer, SquareOrder, SquarePayment } from "@/app/api/integrations/square/_lib";

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

function runCustomerDetailResolverTests() {
  const payment: SquarePayment = { id: "pay_1", status: "COMPLETED", order_id: "order_1", buyer_email_address: "payment@example.com" };

  const fulfillmentOrder: SquareOrder = {
    id: "order_1",
    line_items: [{ uid: "line_1", catalog_object_id: "var_1", quantity: "3" }],
    fulfillments: [{ pickup_details: { recipient: { display_name: "Jane Doe", email_address: "jane.doe@example.com", phone_number: "555-111-2222" } } }],
  };
  const fulfillmentResult = resolveSquarePurchaserDetails({ payment, order: fulfillmentOrder, customer: null });
  expectEqual(fulfillmentResult.purchaserName, "Jane Doe", "fulfillment name");
  expectEqual(fulfillmentResult.purchaserEmail, "jane.doe@example.com", "fulfillment email");
  expectEqual(fulfillmentResult.customerSource, "order_fulfillment", "fulfillment source");

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

  const incompleteResult = resolveSquarePurchaserDetails({ payment: { id: "pay_4", status: "COMPLETED", order_id: "order_4" }, order: { id: "order_4" }, customer: null });
  expectEqual(incompleteResult.purchaserName, "Square Customer", "incomplete fallback name");
  expectEqual(incompleteResult.purchaserEmail, null, "incomplete email");
  expectEqual(incompleteResult.customerSource, "unavailable", "incomplete source");
}

runCustomerDetailResolverTests();
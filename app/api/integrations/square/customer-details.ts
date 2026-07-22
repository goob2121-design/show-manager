import type { SquareCustomer, SquareOrder, SquarePayment } from "@/app/api/integrations/square/_lib";

export type SquareCustomerSource = "order_fulfillment" | "square_customer" | "payment_or_order" | "unavailable";

export type ResolvedSquarePurchaserDetails = {
  purchaserName: string;
  purchaserEmail: string | null;
  purchaserPhone: string | null;
  nameFound: boolean;
  emailFound: boolean;
  phoneFound: boolean;
  customerSource: SquareCustomerSource;
  customerId: string | null;
};

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeEmail(value: string | null | undefined) {
  const trimmed = normalizeText(value);
  if (!trimmed) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function joinName(givenName: string | null | undefined, familyName: string | null | undefined) {
  return [normalizeText(givenName), normalizeText(familyName)].filter(Boolean).join(" ") || null;
}

export function getSquareOrderRecipient(order: SquareOrder | null) {
  const fulfillment = order?.fulfillments?.find((item) => item.pickup_details?.recipient || item.shipment_details?.recipient);
  return fulfillment?.pickup_details?.recipient ?? fulfillment?.shipment_details?.recipient ?? null;
}

export function getSquareOrderCustomerId(order: SquareOrder | null, payment: SquarePayment | null) {
  return normalizeText(order?.customer_id)
    ?? normalizeText(order?.tenders?.find((tender) => normalizeText(tender.customer_id))?.customer_id)
    ?? normalizeText(payment?.customer_id);
}

export function resolveSquarePurchaserDetails(input: {
  payment: SquarePayment | null;
  order: SquareOrder | null;
  customer: SquareCustomer | null;
  existingPurchaserName?: string | null;
}) : ResolvedSquarePurchaserDetails {
  const recipient = getSquareOrderRecipient(input.order);
  const customerName = joinName(input.customer?.given_name, input.customer?.family_name) ?? normalizeText(input.customer?.company_name);
  const paymentOrOrderName = normalizeText(input.existingPurchaserName);

  const fulfillmentEmail = normalizeEmail(recipient?.email_address);
  const customerEmail = normalizeEmail(input.customer?.email_address);
  const paymentOrOrderEmail = normalizeEmail(input.payment?.buyer_email_address);

  const fulfillmentName = normalizeText(recipient?.display_name);
  const fulfillmentPhone = normalizeText(recipient?.phone_number);
  const customerPhone = normalizeText(input.customer?.phone_number);

  const purchaserEmail = fulfillmentEmail ?? customerEmail ?? paymentOrOrderEmail;
  const purchaserName = fulfillmentName ?? customerName ?? paymentOrOrderName ?? "Square Customer";
  const purchaserPhone = fulfillmentPhone ?? customerPhone;
  const customerId = getSquareOrderCustomerId(input.order, input.payment);

  let customerSource: SquareCustomerSource = "unavailable";
  if (fulfillmentEmail || fulfillmentName || fulfillmentPhone) customerSource = "order_fulfillment";
  else if (customerEmail || customerName || customerPhone) customerSource = "square_customer";
  else if (paymentOrOrderEmail || paymentOrOrderName) customerSource = "payment_or_order";

  return {
    purchaserName,
    purchaserEmail,
    purchaserPhone,
    nameFound: purchaserName !== "Square Customer",
    emailFound: Boolean(purchaserEmail),
    phoneFound: Boolean(purchaserPhone),
    customerSource,
    customerId,
  };
}
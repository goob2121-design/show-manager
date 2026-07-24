import type { SquareCustomer, SquareOrder, SquareOrderRecipient, SquarePayment } from "@/app/api/integrations/square/_lib";

export type SquareCustomerSource = "order_fulfillment" | "square_customer" | "payment_or_order" | "unavailable";
export type SquareFulfillmentRecipientType = "pickup" | "shipment" | "delivery";

export type SquareFulfillmentRecipientMatch = {
  type: SquareFulfillmentRecipientType;
  recipient: SquareOrderRecipient;
};

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

export function getSquareOrderRecipientMatches(order: SquareOrder | null): SquareFulfillmentRecipientMatch[] {
  return (order?.fulfillments ?? []).flatMap((fulfillment) => {
    const matches: SquareFulfillmentRecipientMatch[] = [];
    if (fulfillment.pickup_details?.recipient) matches.push({ type: "pickup", recipient: fulfillment.pickup_details.recipient });
    if (fulfillment.shipment_details?.recipient) matches.push({ type: "shipment", recipient: fulfillment.shipment_details.recipient });
    if (fulfillment.delivery_details?.recipient) matches.push({ type: "delivery", recipient: fulfillment.delivery_details.recipient });
    return matches;
  });
}

export function getSquareOrderRecipient(order: SquareOrder | null) {
  return getSquareOrderRecipientMatches(order)[0]?.recipient ?? null;
}

export function getSquareOrderCustomerId(order: SquareOrder | null, payment: SquarePayment | null) {
  return normalizeText(order?.customer_id)
    ?? normalizeText(order?.tenders?.find((tender) => normalizeText(tender.customer_id))?.customer_id)
    ?? normalizeText(payment?.customer_id);
}

function getSquareCardholderName(order: SquareOrder | null, payment: SquarePayment | null) {
  return normalizeText(payment?.card_details?.card?.cardholder_name)
    ?? normalizeText(order?.tenders?.find((tender) => normalizeText(tender.card_details?.card?.cardholder_name))?.card_details?.card?.cardholder_name);
}

export function resolveSquarePurchaserDetails(input: {
  payment: SquarePayment | null;
  order: SquareOrder | null;
  customer: SquareCustomer | null;
  existingPurchaserName?: string | null;
}) : ResolvedSquarePurchaserDetails {
  const recipient = getSquareOrderRecipient(input.order);
  const customerName = joinName(input.customer?.given_name, input.customer?.family_name) ?? normalizeText(input.customer?.company_name);
  const paymentOrOrderName = getSquareCardholderName(input.order, input.payment) ?? normalizeText(input.existingPurchaserName);

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
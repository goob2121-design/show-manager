import { NextResponse } from "next/server";
import { getSquareOrderCustomerId, getSquareOrderRecipientMatches, resolveSquarePurchaserDetails } from "@/app/api/integrations/square/customer-details";
import {
  createServiceRoleSupabaseClient,
  getSquarePhase1Config,
  retrieveSquareCustomer,
  retrieveSquareOrder,
  retrieveSquarePayment,
  SquareApiError,
  verifySquareWebhookSignature,
  type SquareOrderLineItem,
} from "@/app/api/integrations/square/_lib";
import {
  findSquarePendingCheckout,
  getMatchingSquareLineItem,
  getSquareLineItemQuantity,
  markSquarePendingCheckoutCompleted,
  markSquarePendingCheckoutError,
} from "@/app/api/integrations/square/pending-checkouts";
import { ingestExternalTicketSale } from "@/lib/ticket-ingestion";

export const runtime = "nodejs";

type SquareWebhookEvent = {
  merchant_id?: string;
  type?: string;
  event_id?: string;
  data?: { id?: string; type?: string; object?: { payment?: { id?: string; status?: string; order_id?: string } } };
};

function getLineItemQuantity(lineItem: SquareOrderLineItem) {
  const parsed = Number.parseInt(lineItem.quantity ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function sanitizeSquareError(error: unknown) {
  if (!(error instanceof SquareApiError)) return null;
  return error.toSanitizedResponse();
}

function summarizeCustomerLookupError(error: unknown) {
  if (!(error instanceof SquareApiError)) return "customer_lookup_failed";
  return error.toSanitizedResponse().errors.map((item) => item.code ?? item.detail ?? item.category).filter(Boolean).join(", ") || `Square API ${error.httpStatus}`;
}

function getPropertyNames(value: unknown) {
  return value && typeof value === "object" ? Object.keys(value).sort() : [];
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

async function recordImportEvent(input: {
  eventId: string | null;
  eventType: string | null;
  paymentId: string | null;
  orderId: string | null;
  lineItemUid: string | null;
  catalogVariationId: string | null;
  showId: string | null;
  showName: string | null;
  result: string;
  ticketCount: number | null;
  emailPresent: boolean;
  seatLinkCreated: boolean;
  errorMessage?: string | null;
  payloadSummary?: Record<string, unknown> | null;
  importedAt?: string | null;
}) {
  try {
    const supabase = createServiceRoleSupabaseClient();
    await supabase.from("square_ticket_import_events").insert({
      event_id: input.eventId,
      event_type: input.eventType,
      payment_id: input.paymentId,
      order_id: input.orderId,
      line_item_uid: input.lineItemUid,
      catalog_variation_id: input.catalogVariationId,
      show_id: input.showId,
      show_name: input.showName,
      result: input.result,
      ticket_count: input.ticketCount,
      email_present: input.emailPresent,
      seat_link_created: input.seatLinkCreated,
      email_sent: false,
      error_message: input.errorMessage ?? null,
      payload_summary: input.payloadSummary ?? null,
      imported_at: input.importedAt ?? null,
    });
  } catch (error) {
    console.error("Square import event log failed.", error instanceof Error ? error.message : "Unknown error");
  }
}

export async function POST(request: Request) {
  const { config, missing, invalid } = getSquarePhase1Config();
  if (!config) {
    console.error("Square webhook configuration is incomplete.", { missing, invalid });
    return NextResponse.json({ success: false, error: "Square Sandbox webhook is not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature");
  if (!verifySquareWebhookSignature(rawBody, signature, config)) {
    return NextResponse.json({ success: false, error: "Invalid Square signature." }, { status: 403 });
  }

  let event: SquareWebhookEvent;
  try {
    event = JSON.parse(rawBody) as SquareWebhookEvent;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  const eventType = event.type ?? null;
  const eventId = event.event_id ?? event.data?.id ?? null;
  if (eventType !== "payment.updated") {
    await recordImportEvent({ eventId, eventType, paymentId: null, orderId: null, lineItemUid: null, catalogVariationId: null, showId: null, showName: null, result: "ignored_event", ticketCount: null, emailPresent: false, seatLinkCreated: false });
    return NextResponse.json({ success: true, result: "ignored_event" });
  }

  const eventPayment = event.data?.object?.payment;
  const paymentId = eventPayment?.id;
  if (!paymentId) {
    await recordImportEvent({ eventId, eventType, paymentId: null, orderId: null, lineItemUid: null, catalogVariationId: null, showId: null, showName: null, result: "missing_payment_id", ticketCount: null, emailPresent: false, seatLinkCreated: false });
    return NextResponse.json({ success: true, result: "missing_payment_id" });
  }

  try {
    const payment = await retrieveSquarePayment(config, paymentId);
    const paymentStatus = payment?.status ?? eventPayment?.status ?? "UNKNOWN";
    const orderId = payment?.order_id ?? eventPayment?.order_id ?? null;

    if (paymentStatus !== "COMPLETED") {
      await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid: null, catalogVariationId: null, showId: null, showName: null, result: "ignored_status", ticketCount: null, emailPresent: false, seatLinkCreated: false, payloadSummary: { paymentStatus } });
      return NextResponse.json({ success: true, result: "ignored_status" });
    }

    if (!payment || !orderId) {
      await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid: null, catalogVariationId: null, showId: null, showName: null, result: "missing_order_id", ticketCount: null, emailPresent: false, seatLinkCreated: false });
      return NextResponse.json({ success: true, result: "missing_order_id" });
    }

    const order = await retrieveSquareOrder(config, orderId);
    const supabase = createServiceRoleSupabaseClient();
    const pendingCheckout = await findSquarePendingCheckout(supabase, { orderId, paymentId, referenceId: order?.reference_id ?? null });

    if (pendingCheckout) {
      const matchingLineItem = getMatchingSquareLineItem(order, pendingCheckout.catalog_variation_id);
      const actualQuantity = getSquareLineItemQuantity(matchingLineItem);
      const pendingSummary = {
        pendingCheckoutCreated: true,
        nameFound: true,
        emailFound: true,
        requestedQuantity: pendingCheckout.ticket_count,
        squareOrderMatched: true,
        customerSource: "stageflow_pending_checkout",
      };

      if (!matchingLineItem || actualQuantity !== pendingCheckout.ticket_count) {
        const mismatch = !matchingLineItem ? "variation_mismatch" : "quantity_mismatch";
        await markSquarePendingCheckoutError(supabase, pendingCheckout.id, mismatch);
        await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid: matchingLineItem?.uid ?? null, catalogVariationId: pendingCheckout.catalog_variation_id, showId: pendingCheckout.show_id, showName: null, result: `pending_checkout_${mismatch}`, ticketCount: actualQuantity || null, emailPresent: true, seatLinkCreated: false, errorMessage: mismatch, payloadSummary: { ...pendingSummary, actualQuantity } });
        return NextResponse.json({ success: true, results: [{ status: `pending_checkout_${mismatch}`, pendingCheckoutId: pendingCheckout.id }] });
      }

      const result = await ingestExternalTicketSale(supabase, {
        source: "square",
        eventId: eventId ?? "unknown-event",
        paymentId,
        orderId,
        lineItemUid: matchingLineItem.uid ?? pendingCheckout.id,
        catalogVariationId: pendingCheckout.catalog_variation_id,
        purchaserName: pendingCheckout.purchaser_name,
        purchaserEmail: pendingCheckout.purchaser_email,
        quantity: pendingCheckout.ticket_count,
        amountPaid: typeof matchingLineItem.total_money?.amount === "number" ? matchingLineItem.total_money.amount / 100 : null,
        currency: matchingLineItem.total_money?.currency ?? payment.amount_money?.currency ?? null,
        paymentStatus,
        payloadSummary: { eventType, paymentStatus, orderId, lineItemUid: matchingLineItem.uid ?? null, catalogVariationId: pendingCheckout.catalog_variation_id, quantity: pendingCheckout.ticket_count, ...pendingSummary },
      });

      await markSquarePendingCheckoutCompleted(supabase, pendingCheckout.id, { paymentId, orderId, importedTicketId: result.ticketId });
      await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid: matchingLineItem.uid ?? null, catalogVariationId: pendingCheckout.catalog_variation_id, showId: result.showId, showName: result.showName, result: result.status, ticketCount: result.ticketCount, emailPresent: result.emailPresent, seatLinkCreated: result.seatLinkCreated, errorMessage: result.errorMessage ?? null, payloadSummary: { importResult: result.status, seatLinkCreated: result.seatLinkCreated, emailSent: false, ...pendingSummary }, importedAt: result.status === "imported" || result.status === "incomplete_customer" || result.status === "duplicate" ? new Date().toISOString() : null });
      return NextResponse.json({ success: true, results: [result] });
    }

    const squareCustomerId = getSquareOrderCustomerId(order, payment);
    let customer = null;
    let customerLookupError: string | null = null;
    let customerRetrievalAttempted = false;
    let customerRetrievalHttpStatus: number | null = null;

    if (squareCustomerId) {
      customerRetrievalAttempted = true;
      try {
        customer = await retrieveSquareCustomer(config, squareCustomerId);
        customerRetrievalHttpStatus = 200;
      } catch (error) {
        customerRetrievalHttpStatus = error instanceof SquareApiError ? error.httpStatus : null;
        customerLookupError = summarizeCustomerLookupError(error);
        console.warn("Square customer retrieval failed; importing paid order with available details.", { paymentId, orderId, customerIdPresent: true, squareError: sanitizeSquareError(error) });
      }
    }

    if (config.environment === "sandbox") {
      const recipientMatches = getSquareOrderRecipientMatches(order);
      const fulfillmentTypesFound = Array.from(new Set((order?.fulfillments ?? []).flatMap((fulfillment) => [fulfillment.pickup_details ? "pickup" : null, fulfillment.shipment_details ? "shipment" : null, fulfillment.delivery_details ? "delivery" : null].filter(Boolean))));
      console.info("Square Sandbox customer detail diagnostics", {
        payment: { propertyNames: getPropertyNames(payment), buyerEmailAddressExists: hasText(payment?.buyer_email_address), orderIdExists: hasText(payment?.order_id), customerIdExists: hasText(payment?.customer_id) },
        order: { propertyNames: getPropertyNames(order), customerIdExists: hasText(order?.customer_id) || Boolean(order?.tenders?.some((tender) => hasText(tender.customer_id))), fulfillmentsExists: Array.isArray(order?.fulfillments) && order.fulfillments.length > 0, fulfillmentTypesFound, pickupRecipientExists: recipientMatches.some((match) => match.type === "pickup"), shipmentRecipientExists: recipientMatches.some((match) => match.type === "shipment"), deliveryRecipientExists: recipientMatches.some((match) => match.type === "delivery"), recipientsExist: recipientMatches.length > 0, recipientEmailAddressExists: recipientMatches.some((match) => hasText(match.recipient.email_address)), recipientDisplayNameExists: recipientMatches.some((match) => hasText(match.recipient.display_name)), lineItemsExist: Array.isArray(order?.line_items) && order.line_items.length > 0 },
        customer: { retrievalAttempted: customerRetrievalAttempted, httpStatus: customerRetrievalHttpStatus, givenNameExists: hasText(customer?.given_name), familyNameExists: hasText(customer?.family_name), emailAddressExists: hasText(customer?.email_address), phoneNumberExists: hasText(customer?.phone_number) },
      });
    }

    const purchaserDetails = resolveSquarePurchaserDetails({ payment, order, customer });
    const customerSummary = { nameFound: purchaserDetails.nameFound, emailFound: purchaserDetails.emailFound, phoneFound: purchaserDetails.phoneFound, customerSource: purchaserDetails.customerSource, customerIdPresent: Boolean(purchaserDetails.customerId), customerLookupError, squareOrderMatched: false };
    const results = [];

    for (const lineItem of order?.line_items ?? []) {
      const catalogVariationId = lineItem.catalog_object_id?.trim() ?? "";
      const lineItemUid = lineItem.uid?.trim() ?? "";
      const quantity = getLineItemQuantity(lineItem);

      if (!catalogVariationId || !lineItemUid) {
        await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid: lineItemUid || null, catalogVariationId: catalogVariationId || null, showId: null, showName: null, result: "unmapped_item", ticketCount: null, emailPresent: purchaserDetails.emailFound, seatLinkCreated: false, payloadSummary: customerSummary });
        results.push({ status: "unmapped_item", lineItemUid: lineItemUid || null });
        continue;
      }

      const result = await ingestExternalTicketSale(supabase, { source: "square", eventId: eventId ?? "unknown-event", paymentId, orderId, lineItemUid, catalogVariationId, purchaserName: purchaserDetails.purchaserName, purchaserEmail: purchaserDetails.purchaserEmail, quantity, amountPaid: typeof lineItem.total_money?.amount === "number" ? lineItem.total_money.amount / 100 : null, currency: lineItem.total_money?.currency ?? payment.amount_money?.currency ?? null, paymentStatus, payloadSummary: { eventType, paymentStatus, orderId, lineItemUid, catalogVariationId, lineItemName: lineItem.name ?? null, quantity, amountCurrency: lineItem.total_money?.currency ?? payment.amount_money?.currency ?? null, ...customerSummary } });
      await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid, catalogVariationId, showId: result.showId, showName: result.showName, result: result.status, ticketCount: result.ticketCount, emailPresent: result.emailPresent, seatLinkCreated: result.seatLinkCreated, errorMessage: result.errorMessage ?? null, payloadSummary: { lineItemName: lineItem.name ?? null, paymentStatus, ...customerSummary }, importedAt: result.status === "imported" || result.status === "incomplete_customer" || result.status === "duplicate" ? new Date().toISOString() : null });
      results.push(result);
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Square webhook processing failed.";
    await recordImportEvent({ eventId, eventType, paymentId, orderId: null, lineItemUid: null, catalogVariationId: null, showId: null, showName: null, result: "error", ticketCount: null, emailPresent: false, seatLinkCreated: false, errorMessage: message });
    return NextResponse.json({ success: false, error: "Square webhook processing failed." }, { status: 500 });
  }
}
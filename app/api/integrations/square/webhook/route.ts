import { NextResponse } from "next/server";
import { getSquareOrderCustomerId, getSquareOrderRecipientMatches, resolveSquarePurchaserDetails } from "@/app/api/integrations/square/customer-details";
import {
  createServiceRoleSupabaseClient,
  getSquarePhase1Config,
  getSquareHmacSha256SignatureHeader,
  maskIdentifier,
  retrieveSquareCustomer,
  retrieveSquareOrder,
  retrieveSquarePayment,
  SquareApiError,
  verifySquareWebhookSignature,
  type SquareOrder,
  type SquareOrderLineItem,
} from "@/app/api/integrations/square/_lib";
import {
  findSquarePendingCheckout,
  getMatchingSquareLineItem,
  getSquareLineItemQuantity,
  markSquarePendingCheckoutCompleted,
  markSquarePendingCheckoutError,
} from "@/app/api/integrations/square/pending-checkouts";
import { ingestExternalTicketSale, type IngestExternalTicketSaleResult } from "@/lib/ticket-ingestion";
import {
  sendTrackedReservedSeatEmail,
  trackedEmailStateWasSent,
} from "@/lib/email/send-reserved-seat-link-email";

export const runtime = "nodejs";

type SquareWebhookEvent = {
  merchant_id?: string;
  type?: string;
  event_id?: string;
  data?: { id?: string; type?: string; object?: { payment?: { id?: string; status?: string; order_id?: string; card_details?: { statement_description?: string } } } };
};

const ORDER_RETRY_DELAYS_MS = [500, 1000] as const;

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function retrieveSquareOrderWithRetry(
  retrieveOrder: () => Promise<SquareOrder | null>,
  sleep: (milliseconds: number) => Promise<void> = wait,
) {
  let order: SquareOrder | null = null;
  for (let attempt = 0; attempt <= ORDER_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(ORDER_RETRY_DELAYS_MS[attempt - 1]);
    order = await retrieveOrder();
    if (order?.line_items?.length) return { order, attempts: attempt + 1 };
  }
  return { order, attempts: ORDER_RETRY_DELAYS_MS.length + 1 };
}

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

type WebhookProcessingStage =
  | "parse_payload"
  | "validate_event"
  | "retrieve_payment"
  | "retrieve_order"
  | "resolve_customer"
  | "map_show"
  | "ingest_ticket"
  | "create_seat_link"
  | "send_email"
  | "record_event"
  | "complete";

export function getSquareDeveloperDashboardTestAcknowledgement(
  event: SquareWebhookEvent,
  headers: Pick<Headers, "has">,
) {
  const statementDescription = event.data?.object?.payment?.card_details?.statement_description?.trim();
  const hasInitialDeliveryTimestamp = headers.has("square-initial-delivery-timestamp");
  const isOfficialSample =
    event.type === "payment.updated" &&
    hasInitialDeliveryTimestamp &&
    statementDescription === "SQ *DEFAULT TEST ACCOUNT";

  return isOfficialSample
    ? { status: 200 as const, result: "test_event_acknowledged" as const }
    : null;
}

function sanitizeWebhookProcessingText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted phone]")
    .replace(/https?:\/\/\S+/gi, "[redacted url]")
    .slice(0, 2000);
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
  emailSent?: boolean;
}) {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase.from("square_ticket_import_events").insert({
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
      email_sent: input.emailSent ?? false,
      error_message: input.errorMessage ?? null,
      payload_summary: input.payloadSummary ?? null,
      imported_at: input.importedAt ?? null,
    });
  if (!error || error.code === "23505") return true;
  throw error;
}

async function maybeSendImportedSeatEmail(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  result: IngestExternalTicketSaleResult,
  environment: "sandbox" | "production",
) {
  if (environment === "sandbox" && process.env.SQUARE_SANDBOX_SEND_EMAILS !== "true") return { emailAttempted: false, emailSent: false, emailResult: "not_attempted", error: null };
  if (!result.ticketId || !result.emailPresent || !result.seatLinkCreated) return { emailAttempted: false, emailSent: false, emailResult: "not_attempted", error: null };

  const { data: link, error: linkError } = await supabase.from("show_reserved_seating_links").select("id").eq("source_ticket_id", result.ticketId).maybeSingle();
  if (linkError) return { emailAttempted: false, emailSent: false, emailResult: "failed", error: "seat_link_lookup_failed" };
  if (!link) return { emailAttempted: false, emailSent: false, emailResult: "failed", error: "seat_link_not_found" };

  const emailResult = await sendTrackedReservedSeatEmail(supabase, link.id);
  return {
    emailAttempted: true,
    emailSent: trackedEmailStateWasSent(emailResult.deliveryState),
    emailResult: emailResult.deliveryState,
    error: emailResult.failed ? emailResult.error : null,
  };
}
export async function POST(request: Request) {
  const { config, missing, invalid } = getSquarePhase1Config();
  if (!config) {
    console.error("Square webhook configuration is incomplete.", { missing, invalid });
    return NextResponse.json({ success: false, error: "Square Sandbox webhook is not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = getSquareHmacSha256SignatureHeader(request.headers);
  const legacySignatureExists = request.headers.has("x-square-signature");
  console.info("Square webhook signature headers received.", {
    hmacSha256SignatureExists: signature !== null,
    legacySignatureExists,
    selectedHeader: signature !== null ? "x-square-hmacsha256-signature" : "none",
  });
  if (!verifySquareWebhookSignature(rawBody, signature, config)) {
    return NextResponse.json({ success: false, error: "Invalid Square signature." }, { status: 403 });
  }

  let processingStage: WebhookProcessingStage = "parse_payload";
  let eventType: string | null = null;
  let eventId: string | null = null;
  let paymentId: string | null = null;
  let orderId: string | null = null;
  let paymentStatus: string | null = null;
  const finalState = {
    mappedVariationFound: false,
    showMatched: false,
    ticketImported: false,
    duplicateDetected: false,
    customerEmailFound: false,
    customerNameFound: false,
    seatLinkCreated: false,
    emailAttempted: false,
    emailSent: false,
    eventResultRowRecorded: false,
  };
  const respondSuccess = (body: Record<string, unknown>, resultCode: string, status = 200) => {
    console.info("Square webhook final result.", {
      eventType,
      processingStage,
      finalResultCode: resultCode,
      paymentStatus,
      paymentId: maskIdentifier(paymentId),
      orderId: maskIdentifier(orderId),
      mappedVariationFound: finalState.mappedVariationFound,
      showMatched: finalState.showMatched,
      ticketImported: finalState.ticketImported,
      duplicateDetected: finalState.duplicateDetected,
      customerEmailFound: finalState.customerEmailFound,
      customerNameFound: finalState.customerNameFound,
      seatLinkCreated: finalState.seatLinkCreated,
      emailAttempted: finalState.emailAttempted,
      emailSent: finalState.emailSent,
      eventResultRowRecorded: finalState.eventResultRowRecorded,
    });
    return NextResponse.json(body, { status });
  };

  try {
    processingStage = "parse_payload";
    const event = JSON.parse(rawBody) as SquareWebhookEvent;

    processingStage = "validate_event";
    eventType = event.type ?? null;
    eventId = event.event_id ?? event.data?.id ?? null;
    if (eventType !== "payment.updated") {
      processingStage = "record_event";
      finalState.eventResultRowRecorded = await recordImportEvent({ eventId, eventType, paymentId: null, orderId: null, lineItemUid: null, catalogVariationId: null, showId: null, showName: null, result: "ignored_event", ticketCount: null, emailPresent: false, seatLinkCreated: false });
      processingStage = "complete";
      return respondSuccess({ success: true, result: "ignored_event" }, "ignored_event");
    }

    const eventPayment = event.data?.object?.payment;
    paymentId = eventPayment?.id ?? null;
    if (!paymentId) {
      processingStage = "record_event";
      finalState.eventResultRowRecorded = await recordImportEvent({ eventId, eventType, paymentId: null, orderId: null, lineItemUid: null, catalogVariationId: null, showId: null, showName: null, result: "missing_payment_id", ticketCount: null, emailPresent: false, seatLinkCreated: false });
      processingStage = "complete";
      return respondSuccess({ success: true, result: "missing_payment_id" }, "missing_payment_id");
    }

    const testAcknowledgement = getSquareDeveloperDashboardTestAcknowledgement(event, request.headers);
    if (testAcknowledgement) {
      processingStage = "record_event";
      finalState.eventResultRowRecorded = await recordImportEvent({ eventId, eventType, paymentId: null, orderId: null, lineItemUid: null, catalogVariationId: null, showId: null, showName: null, result: "test_event_acknowledged", ticketCount: null, emailPresent: false, seatLinkCreated: false });
      processingStage = "complete";
      console.info("Square Developer Dashboard test event acknowledged.", { result: "test_event_acknowledged" });
      return respondSuccess({ success: true, result: testAcknowledgement.result }, testAcknowledgement.result, testAcknowledgement.status);
    }

    processingStage = "retrieve_payment";
    const payment = await retrieveSquarePayment(config, paymentId);
    paymentStatus = payment?.status ?? eventPayment?.status ?? "UNKNOWN";
    orderId = payment?.order_id ?? eventPayment?.order_id ?? null;

    if (paymentStatus !== "COMPLETED") {
      processingStage = "record_event";
      finalState.eventResultRowRecorded = await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid: null, catalogVariationId: null, showId: null, showName: null, result: "ignored_status", ticketCount: null, emailPresent: false, seatLinkCreated: false, payloadSummary: { paymentStatus } });
      processingStage = "complete";
      return respondSuccess({ success: true, result: "ignored_status" }, "ignored_status");
    }

    if (!payment || !orderId) {
      processingStage = "record_event";
      finalState.eventResultRowRecorded = await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid: null, catalogVariationId: null, showId: null, showName: null, result: "missing_order_id", ticketCount: null, emailPresent: false, seatLinkCreated: false });
      processingStage = "complete";
      return respondSuccess({ success: true, result: "missing_order_id" }, "missing_order_id");
    }

    processingStage = "retrieve_order";
    const resolvedOrderId = orderId;
    const orderRetrieval = await retrieveSquareOrderWithRetry(() => retrieveSquareOrder(config, resolvedOrderId));
    const order = orderRetrieval.order;
    processingStage = "map_show";
    const supabase = createServiceRoleSupabaseClient();
    const pendingCheckout = await findSquarePendingCheckout(supabase, { orderId, paymentId, referenceId: order?.reference_id ?? null });

    if (pendingCheckout) {
      finalState.customerNameFound = true;
      finalState.customerEmailFound = true;
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
        processingStage = "record_event";
        finalState.eventResultRowRecorded = await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid: matchingLineItem?.uid ?? null, catalogVariationId: pendingCheckout.catalog_variation_id, showId: pendingCheckout.show_id, showName: null, result: `pending_checkout_${mismatch}`, ticketCount: actualQuantity || null, emailPresent: true, seatLinkCreated: false, errorMessage: mismatch, payloadSummary: { ...pendingSummary, actualQuantity } });
        processingStage = "complete";
        finalState.mappedVariationFound = Boolean(matchingLineItem);
        finalState.showMatched = true;
        return respondSuccess({ success: true, results: [{ status: `pending_checkout_${mismatch}`, pendingCheckoutId: pendingCheckout.id }] }, `pending_checkout_${mismatch}`);
      }

      processingStage = "ingest_ticket";
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

      processingStage = "create_seat_link";
      await markSquarePendingCheckoutCompleted(supabase, pendingCheckout.id, { paymentId, orderId, importedTicketId: result.ticketId });
      processingStage = "send_email";
      const emailDelivery = await maybeSendImportedSeatEmail(supabase, result, config.environment);
      finalState.showMatched ||= Boolean(result.showId);
      finalState.ticketImported ||= result.status === "imported" || result.status === "incomplete_customer";
      finalState.duplicateDetected ||= result.status === "duplicate";
      finalState.seatLinkCreated ||= result.seatLinkCreated;
      finalState.emailAttempted ||= emailDelivery.emailAttempted;
      finalState.emailSent ||= emailDelivery.emailSent;
      processingStage = "record_event";
      finalState.eventResultRowRecorded = await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid: matchingLineItem.uid ?? null, catalogVariationId: pendingCheckout.catalog_variation_id, showId: result.showId, showName: result.showName, result: result.status, ticketCount: result.ticketCount, emailPresent: result.emailPresent, seatLinkCreated: result.seatLinkCreated, emailSent: emailDelivery.emailSent, errorMessage: result.errorMessage ?? emailDelivery.error, payloadSummary: { importResult: result.status, seatLinkCreated: result.seatLinkCreated, seatLinkAction: result.seatLinkAction ?? "failed", emailSent: emailDelivery.emailSent, emailResult: emailDelivery.emailResult, ...pendingSummary }, importedAt: result.status === "imported" || result.status === "incomplete_customer" || result.status === "duplicate" ? new Date().toISOString() : null });
      processingStage = "complete";
      finalState.mappedVariationFound = true;
      finalState.showMatched = Boolean(result.showId);
      finalState.ticketImported = result.status === "imported" || result.status === "incomplete_customer";
      finalState.duplicateDetected = result.status === "duplicate";
      finalState.customerEmailFound = result.emailPresent;
      finalState.customerNameFound = true;
      finalState.seatLinkCreated = result.seatLinkCreated;
      finalState.emailAttempted = emailDelivery.emailAttempted;
      finalState.emailSent = emailDelivery.emailSent;
      return respondSuccess({ success: true, results: [result] }, result.status);
    }

    if (!order || !order.line_items?.length) {
      const resultCode = order ? "no_line_items" : "missing_order";
      processingStage = "record_event";
      finalState.eventResultRowRecorded = await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid: null, catalogVariationId: null, showId: null, showName: null, result: resultCode, ticketCount: null, emailPresent: Boolean(payment.buyer_email_address), seatLinkCreated: false, payloadSummary: { paymentStatus, orderRetrievalAttempts: orderRetrieval.attempts, retryable: true } });
      console.info("Square webhook order retrieval exhausted.", {
        eventType,
        processingStage,
        finalResultCode: resultCode,
        paymentStatus,
        paymentId: maskIdentifier(paymentId),
        orderId: maskIdentifier(orderId),
        orderRetrievalAttempts: orderRetrieval.attempts,
        eventResultRowRecorded: finalState.eventResultRowRecorded,
      });
      return NextResponse.json(
        { success: false, retryable: true, stage: "retrieve_order", error: resultCode === "missing_order" ? "Square Order is not available yet." : "Square Order line items are not available yet." },
        { status: 500 },
      );
    }

    processingStage = "resolve_customer";
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
    finalState.customerNameFound = purchaserDetails.nameFound;
    finalState.customerEmailFound = purchaserDetails.emailFound;
    const customerSummary = { nameFound: purchaserDetails.nameFound, emailFound: purchaserDetails.emailFound, phoneFound: purchaserDetails.phoneFound, customerSource: purchaserDetails.customerSource, customerIdPresent: Boolean(purchaserDetails.customerId), customerLookupError, squareOrderMatched: false };
    const results = [];

    for (const lineItem of order?.line_items ?? []) {
      processingStage = "map_show";
      const catalogVariationId = lineItem.catalog_object_id?.trim() ?? "";
      const lineItemUid = lineItem.uid?.trim() ?? "";
      const quantity = getLineItemQuantity(lineItem);
      if (catalogVariationId) finalState.mappedVariationFound = true;

      if (!catalogVariationId || !lineItemUid) {
        processingStage = "record_event";
        finalState.eventResultRowRecorded = await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid: lineItemUid || null, catalogVariationId: catalogVariationId || null, showId: null, showName: null, result: "unmapped_item", ticketCount: null, emailPresent: purchaserDetails.emailFound, seatLinkCreated: false, payloadSummary: customerSummary });
        results.push({ status: "unmapped_item", lineItemUid: lineItemUid || null });
        continue;
      }

      processingStage = "ingest_ticket";
      const result = await ingestExternalTicketSale(supabase, { source: "square", eventId: eventId ?? "unknown-event", paymentId, orderId, lineItemUid, catalogVariationId, purchaserName: purchaserDetails.purchaserName, purchaserEmail: purchaserDetails.purchaserEmail, quantity, amountPaid: typeof lineItem.total_money?.amount === "number" ? lineItem.total_money.amount / 100 : null, currency: lineItem.total_money?.currency ?? payment.amount_money?.currency ?? null, paymentStatus, payloadSummary: { eventType, paymentStatus, orderId, lineItemUid, catalogVariationId, lineItemName: lineItem.name ?? null, quantity, amountCurrency: lineItem.total_money?.currency ?? payment.amount_money?.currency ?? null, ...customerSummary } });
      processingStage = "create_seat_link";
      processingStage = "send_email";
      const emailDelivery = await maybeSendImportedSeatEmail(supabase, result, config.environment);
      finalState.showMatched ||= Boolean(result.showId);
      finalState.ticketImported ||= result.status === "imported" || result.status === "incomplete_customer";
      finalState.duplicateDetected ||= result.status === "duplicate";
      finalState.seatLinkCreated ||= result.seatLinkCreated;
      finalState.emailAttempted ||= emailDelivery.emailAttempted;
      finalState.emailSent ||= emailDelivery.emailSent;
      processingStage = "record_event";
      finalState.eventResultRowRecorded = await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid, catalogVariationId, showId: result.showId, showName: result.showName, result: result.status, ticketCount: result.ticketCount, emailPresent: result.emailPresent, seatLinkCreated: result.seatLinkCreated, emailSent: emailDelivery.emailSent, errorMessage: result.errorMessage ?? emailDelivery.error, payloadSummary: { lineItemName: lineItem.name ?? null, paymentStatus, seatLinkAction: result.seatLinkAction ?? "failed", emailSent: emailDelivery.emailSent, emailResult: emailDelivery.emailResult, ...customerSummary }, importedAt: result.status === "imported" || result.status === "incomplete_customer" || result.status === "duplicate" ? new Date().toISOString() : null });
      results.push(result);
    }

    processingStage = "complete";
    const finalResultCode = results.length === 1 && "status" in results[0] ? String(results[0].status) : "processed";
    return respondSuccess({ success: true, results }, finalResultCode);
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage = sanitizeWebhookProcessingText(
      error instanceof Error ? error.message : "Square webhook processing failed.",
    );
    const stackTrace = error instanceof Error && error.stack
      ? sanitizeWebhookProcessingText(error.stack)
      : null;
    console.error("Square webhook processing failed.", {
      processingStage,
      errorName,
      errorMessage,
      stackTrace,
    });
    finalState.eventResultRowRecorded = await recordImportEvent({ eventId, eventType, paymentId, orderId: null, lineItemUid: null, catalogVariationId: null, showId: null, showName: null, result: "error", ticketCount: null, emailPresent: false, seatLinkCreated: false, errorMessage });
    return NextResponse.json(
      { success: false, stage: processingStage, error: errorMessage },
      { status: 500 },
    );
  }
}

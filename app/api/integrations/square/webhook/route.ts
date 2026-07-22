import { NextResponse } from "next/server";
import { ingestExternalTicketSale } from "@/lib/ticket-ingestion";
import {
  createServiceRoleSupabaseClient,
  getOrderRecipient,
  getSquarePhase1Config,
  retrieveSquareOrder,
  retrieveSquarePayment,
  verifySquareWebhookSignature,
  type SquareOrderLineItem,
} from "@/app/api/integrations/square/_lib";

export const runtime = "nodejs";

type SquareWebhookEvent = {
  merchant_id?: string;
  type?: string;
  event_id?: string;
  data?: {
    id?: string;
    type?: string;
    object?: {
      payment?: {
        id?: string;
        status?: string;
        order_id?: string;
      };
    };
  };
};

function getLineItemQuantity(lineItem: SquareOrderLineItem) {
  const parsed = Number.parseInt(lineItem.quantity ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
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
    const recipient = getOrderRecipient(order, payment);
    const supabase = createServiceRoleSupabaseClient();
    const results = [];

    for (const lineItem of order?.line_items ?? []) {
      const catalogVariationId = lineItem.catalog_object_id?.trim() ?? "";
      const lineItemUid = lineItem.uid?.trim() ?? "";
      if (!catalogVariationId || !lineItemUid) {
        await recordImportEvent({ eventId, eventType, paymentId, orderId, lineItemUid: lineItemUid || null, catalogVariationId: catalogVariationId || null, showId: null, showName: null, result: "unmapped_item", ticketCount: null, emailPresent: Boolean(recipient.email?.trim()), seatLinkCreated: false });
        results.push({ status: "unmapped_item", lineItemUid: lineItemUid || null });
        continue;
      }

      const result = await ingestExternalTicketSale(supabase, {
        source: "square",
        eventId: eventId ?? "unknown-event",
        paymentId,
        orderId,
        lineItemUid,
        catalogVariationId,
        purchaserName: recipient.name,
        purchaserEmail: recipient.email,
        quantity: getLineItemQuantity(lineItem),
        amountPaid: typeof lineItem.total_money?.amount === "number" ? lineItem.total_money.amount / 100 : null,
        currency: lineItem.total_money?.currency ?? payment.amount_money?.currency ?? null,
        paymentStatus,
        payloadSummary: {
          eventType,
          paymentStatus,
          orderId,
          lineItemUid,
          catalogVariationId,
          lineItemName: lineItem.name ?? null,
          quantity: getLineItemQuantity(lineItem),
          amountCurrency: lineItem.total_money?.currency ?? payment.amount_money?.currency ?? null,
        },
      });

      await recordImportEvent({
        eventId,
        eventType,
        paymentId,
        orderId,
        lineItemUid,
        catalogVariationId,
        showId: result.showId,
        showName: result.showName,
        result: result.status,
        ticketCount: result.ticketCount,
        emailPresent: result.emailPresent,
        seatLinkCreated: result.seatLinkCreated,
        errorMessage: result.errorMessage ?? null,
        payloadSummary: { lineItemName: lineItem.name ?? null, paymentStatus },
        importedAt: result.status === "imported" || result.status === "incomplete_customer" || result.status === "duplicate" ? new Date().toISOString() : null,
      });
      results.push(result);
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Square webhook processing failed.";
    await recordImportEvent({ eventId, eventType, paymentId, orderId: null, lineItemUid: null, catalogVariationId: null, showId: null, showName: null, result: "error", ticketCount: null, emailPresent: false, seatLinkCreated: false, errorMessage: message });
    return NextResponse.json({ success: false, error: "Square webhook processing failed." }, { status: 500 });
  }
}
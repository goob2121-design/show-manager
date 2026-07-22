import { NextResponse } from "next/server";
import { getSquareSandboxCatalogConfig, retrieveSquareOrder, retrieveSquarePayment, SquareApiError } from "@/app/api/integrations/square/_lib";

export const runtime = "nodejs";

const SENSITIVE_KEY_PATTERN = /(name|email|phone|token|signature|card|instrument)/i;

type LookupMetadata = {
  inputType: "orderId" | "paymentId";
  resolvedOrderId: string;
  paymentId: string | null;
  orderIdPreferred?: boolean;
};

function sanitizeSquareObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeSquareObject(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) && typeof entry === "string" && entry.trim() ? "***" : sanitizeSquareObject(entry),
    ]),
  );
}

function squareApiFailureResponse(error: SquareApiError, message: string) {
  const status = error.httpStatus === 404 ? 404 : 502;
  return NextResponse.json({ success: false, error: message, squareError: error.toSanitizedResponse() }, { status });
}

async function resolveLookup(input: { orderId: string; paymentId: string }, config: NonNullable<ReturnType<typeof getSquareSandboxCatalogConfig>["config"]>): Promise<LookupMetadata | NextResponse> {
  if (input.orderId) {
    return {
      inputType: "orderId",
      resolvedOrderId: input.orderId,
      paymentId: input.paymentId || null,
      orderIdPreferred: Boolean(input.paymentId),
    };
  }

  if (!input.paymentId) {
    return NextResponse.json({ success: false, error: "Provide either orderId or paymentId." }, { status: 400 });
  }

  try {
    const payment = await retrieveSquarePayment(config, input.paymentId);
    if (!payment) {
      return NextResponse.json({ success: false, error: "Square payment was not found.", lookup: { inputType: "paymentId", paymentId: input.paymentId, resolvedOrderId: null } }, { status: 404 });
    }

    const resolvedOrderId = payment.order_id?.trim() ?? "";
    if (!resolvedOrderId) {
      return NextResponse.json({ success: false, error: "Square payment does not include an order_id.", lookup: { inputType: "paymentId", paymentId: input.paymentId, resolvedOrderId: null } }, { status: 400 });
    }

    return {
      inputType: "paymentId",
      resolvedOrderId,
      paymentId: input.paymentId,
    };
  } catch (error) {
    if (error instanceof SquareApiError) {
      return squareApiFailureResponse(error, "Square API rejected the payment lookup.");
    }

    return NextResponse.json({ success: false, error: "Unable to retrieve Square payment." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { config, missing, invalid } = getSquareSandboxCatalogConfig();
  if (!config) {
    return NextResponse.json({ success: false, error: "Square Sandbox is not configured.", missing, invalid }, { status: 500 });
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId")?.trim() ?? "";
  const paymentId = url.searchParams.get("paymentId")?.trim() ?? "";

  const lookup = await resolveLookup({ orderId, paymentId }, config);
  if (lookup instanceof NextResponse) return lookup;

  try {
    const order = await retrieveSquareOrder(config, lookup.resolvedOrderId);
    if (!order) {
      return NextResponse.json({ success: false, error: "Square order was not found.", lookup, order: null }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      environment: config.environment,
      source: "square_sandbox_debug_order",
      lookup,
      order: sanitizeSquareObject(order),
    });
  } catch (error) {
    if (error instanceof SquareApiError) {
      return squareApiFailureResponse(error, "Square API rejected the order lookup.");
    }

    return NextResponse.json({ success: false, error: "Unable to retrieve Square order.", lookup }, { status: 500 });
  }
}
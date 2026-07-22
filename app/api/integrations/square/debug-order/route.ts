import { NextResponse } from "next/server";
import { getSquareSandboxCatalogConfig, retrieveSquareOrder, SquareApiError } from "@/app/api/integrations/square/_lib";

export const runtime = "nodejs";

const SENSITIVE_KEY_PATTERN = /(name|email|phone|token|signature)/i;

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

export async function GET(request: Request) {
  const { config, missing, invalid } = getSquareSandboxCatalogConfig();
  if (!config) {
    return NextResponse.json({ success: false, error: "Square Sandbox is not configured.", missing, invalid }, { status: 500 });
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId")?.trim() ?? "";
  if (!orderId) {
    return NextResponse.json({ success: false, error: "orderId is required." }, { status: 400 });
  }

  try {
    const order = await retrieveSquareOrder(config, orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: "Square order was not found.", order: null }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      environment: config.environment,
      source: "square_sandbox_debug_order",
      order: sanitizeSquareObject(order),
    });
  } catch (error) {
    if (error instanceof SquareApiError) {
      return NextResponse.json({ success: false, error: "Square API rejected the order lookup.", squareError: error.toSanitizedResponse() }, { status: 502 });
    }

    return NextResponse.json({ success: false, error: "Unable to retrieve Square order." }, { status: 500 });
  }
}
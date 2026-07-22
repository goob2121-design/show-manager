import { createHash, createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

export type SquarePhase1Config = {
  environment: "sandbox";
  accessToken: string;
  webhookSignatureKey: string;
  webhookNotificationUrl: string;
  apiBaseUrl: string;
};

export function getSquarePhase1Config(): { config: SquarePhase1Config | null; missing: string[]; invalid: string[] } {
  const missing: string[] = [];
  const invalid: string[] = [];
  const environment = process.env.SQUARE_ENVIRONMENT;
  const accessToken = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;
  const webhookSignatureKey = process.env.SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY;
  const webhookNotificationUrl = process.env.SQUARE_SANDBOX_WEBHOOK_NOTIFICATION_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

  if (!environment) missing.push("SQUARE_ENVIRONMENT");
  if (!accessToken) missing.push("SQUARE_SANDBOX_ACCESS_TOKEN");
  if (!webhookSignatureKey) missing.push("SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY");
  if (!webhookNotificationUrl) missing.push("SQUARE_SANDBOX_WEBHOOK_NOTIFICATION_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (environment && environment !== "sandbox") invalid.push("SQUARE_ENVIRONMENT must be sandbox for Phase 1");

  if (missing.length > 0 || invalid.length > 0 || environment !== "sandbox" || !accessToken || !webhookSignatureKey || !webhookNotificationUrl) {
    return { config: null, missing, invalid };
  }

  return {
    config: {
      environment: "sandbox",
      accessToken,
      webhookSignatureKey,
      webhookNotificationUrl,
      apiBaseUrl: "https://connect.squareupsandbox.com",
    },
    missing,
    invalid,
  };
}
export function getSquareSandboxCatalogConfig(): { config: SquarePhase1Config | null; missing: string[]; invalid: string[] } {
  const missing: string[] = [];
  const invalid: string[] = [];
  const environment = process.env.SQUARE_ENVIRONMENT;
  const accessToken = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;

  if (!environment) missing.push("SQUARE_ENVIRONMENT");
  if (!accessToken) missing.push("SQUARE_SANDBOX_ACCESS_TOKEN");
  if (environment && environment !== "sandbox") invalid.push("SQUARE_ENVIRONMENT must be sandbox for Phase 1");

  if (missing.length > 0 || invalid.length > 0 || environment !== "sandbox" || !accessToken) {
    return { config: null, missing, invalid };
  }

  return {
    config: {
      environment: "sandbox",
      accessToken,
      webhookSignatureKey: "",
      webhookNotificationUrl: "",
      apiBaseUrl: "https://connect.squareupsandbox.com",
    },
    missing,
    invalid,
  };
}

export function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing server-side Supabase environment variables.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function verifySquareWebhookSignature(rawBody: string, signatureHeader: string | null, config: SquarePhase1Config) {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", config.webhookSignatureKey)
    .update(config.webhookNotificationUrl + rawBody, "utf8")
    .digest("base64");
  const expectedBuffer = Buffer.from(expected, "base64");
  const actualBuffer = Buffer.from(signatureHeader, "base64");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export type SquareApiErrorDetail = {
  category?: string;
  code?: string;
  detail?: string;
  field?: string;
};

export type SanitizedSquareApiError = {
  httpStatus: number;
  statusText: string;
  errors: SquareApiErrorDetail[];
};

export class SquareApiError extends Error {
  readonly httpStatus: number;
  readonly statusText: string;
  readonly errors: SquareApiErrorDetail[];
  readonly responseBody: unknown;
  readonly path: string;

  constructor(input: { httpStatus: number; statusText: string; errors: SquareApiErrorDetail[]; responseBody: unknown; path: string }) {
    const firstError = input.errors[0];
    super(firstError?.detail || firstError?.code || `Square API request failed with status ${input.httpStatus}.`);
    this.name = "SquareApiError";
    this.httpStatus = input.httpStatus;
    this.statusText = input.statusText;
    this.errors = input.errors;
    this.responseBody = input.responseBody;
    this.path = input.path;
  }

  toSanitizedResponse(): SanitizedSquareApiError {
    return {
      httpStatus: this.httpStatus,
      statusText: this.statusText,
      errors: this.errors,
    };
  }

  toServerLogObject() {
    return {
      httpStatus: this.httpStatus,
      statusText: this.statusText,
      path: this.path,
      errors: this.errors,
      responseBody: this.responseBody,
    };
  }
}

function isSquareApiErrorDetail(value: unknown): value is SquareApiErrorDetail {
  return Boolean(value && typeof value === "object");
}

async function squareFetch<T>(config: SquarePhase1Config, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Square-Version": "2026-07-15",
      "Authorization": `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const responseText = await response.text();
  const responseBody = responseText ? JSON.parse(responseText) as unknown : null;

  if (!response.ok) {
    const errors = responseBody && typeof responseBody === "object" && "errors" in responseBody && Array.isArray(responseBody.errors)
      ? responseBody.errors.filter(isSquareApiErrorDetail).map((error) => ({
          category: typeof error.category === "string" ? error.category : undefined,
          code: typeof error.code === "string" ? error.code : undefined,
          detail: typeof error.detail === "string" ? error.detail : undefined,
          field: typeof error.field === "string" ? error.field : undefined,
        }))
      : [];

    throw new SquareApiError({
      httpStatus: response.status,
      statusText: response.statusText,
      errors,
      responseBody,
      path,
    });
  }

  return responseBody as T;
}

export type SquarePayment = {
  id?: string;
  status?: string;
  order_id?: string;
  amount_money?: { amount?: number; currency?: string };
  buyer_email_address?: string;
  customer_id?: string;
  updated_at?: string;
};

export type SquareOrderLineItem = {
  uid?: string;
  name?: string;
  quantity?: string;
  catalog_object_id?: string;
  variation_name?: string;
  total_money?: { amount?: number; currency?: string };
};

export type SquareOrderRecipient = {
  display_name?: string;
  email_address?: string;
  phone_number?: string;
};

export type SquareOrder = {
  id?: string;
  location_id?: string;
  reference_id?: string;
  source?: { name?: string };
  customer_id?: string;
  line_items?: SquareOrderLineItem[];
  fulfillments?: Array<{
    pickup_details?: { recipient?: SquareOrderRecipient };
    shipment_details?: { recipient?: SquareOrderRecipient };
    delivery_details?: { recipient?: SquareOrderRecipient };
  }>;
  tenders?: Array<{ customer_id?: string }>;
};

export type SquareCustomer = {
  id?: string;
  given_name?: string;
  family_name?: string;
  company_name?: string;
  email_address?: string;
  phone_number?: string;
};

export async function retrieveSquarePayment(config: SquarePhase1Config, paymentId: string) {
  const payload = await squareFetch<{ payment?: SquarePayment }>(config, `/v2/payments/${encodeURIComponent(paymentId)}`);
  return payload.payment ?? null;
};

export async function retrieveSquareOrder(config: SquarePhase1Config, orderId: string) {
  const payload = await squareFetch<{ order?: SquareOrder }>(config, `/v2/orders/${encodeURIComponent(orderId)}`);
  return payload.order ?? null;
}

export async function retrieveSquareCustomer(config: SquarePhase1Config, customerId: string) {
  const payload = await squareFetch<{ customer?: SquareCustomer }>(config, `/v2/customers/${encodeURIComponent(customerId)}`);
  return payload.customer ?? null;
}

export function getOrderRecipient(order: SquareOrder | null, payment: SquarePayment | null) {
  const fulfillment = order?.fulfillments?.find((item) => item.pickup_details?.recipient || item.shipment_details?.recipient);
  const pickupRecipient = fulfillment?.pickup_details?.recipient;
  const shipmentRecipient = fulfillment?.shipment_details?.recipient;
  return {
    name: pickupRecipient?.display_name ?? shipmentRecipient?.display_name ?? null,
    email: pickupRecipient?.email_address ?? shipmentRecipient?.email_address ?? payment?.buyer_email_address ?? null,
    phone: pickupRecipient?.phone_number ?? shipmentRecipient?.phone_number ?? null,
  };
}

export function maskIdentifier(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export function getSquareTokenFingerprint(config: SquarePhase1Config) {
  return createHash("sha256").update(config.accessToken).digest("hex").slice(0, 8);
}
export type SquareCatalogMoney = {
  amount?: number;
  currency?: string;
};

export type SquareCatalogVariation = {
  type?: "ITEM_VARIATION";
  id?: string;
  is_deleted?: boolean;
  present_at_all_locations?: boolean;
  present_at_location_ids?: string[];
  absent_at_location_ids?: string[];
  item_variation_data?: {
    item_id?: string;
    name?: string;
    price_money?: SquareCatalogMoney;
    pricing_type?: string;
  };
};

export type SquareCatalogItem = {
  type?: "ITEM";
  id?: string;
  is_deleted?: boolean;
  present_at_all_locations?: boolean;
  present_at_location_ids?: string[];
  absent_at_location_ids?: string[];
  item_data?: {
    name?: string;
    variations?: SquareCatalogVariation[];
  };
};

export async function listSquareCatalogItems(config: SquarePhase1Config) {
  const items: SquareCatalogItem[] = [];
  let cursor: string | undefined;

  do {
    const query = new URLSearchParams({ types: "ITEM" });
    if (cursor) query.set("cursor", cursor);
    const payload = await squareFetch<{ objects?: SquareCatalogItem[]; cursor?: string }>(config, `/v2/catalog/list?${query.toString()}`);
    items.push(...(payload.objects ?? []).filter((item) => item.type === "ITEM"));
    cursor = payload.cursor;
  } while (cursor);

  return items;
}
export async function retrieveSquareCatalogObject(config: SquarePhase1Config, objectId: string) {
  const query = new URLSearchParams({ include_related_objects: "true" });
  const payload = await squareFetch<{ object?: SquareCatalogVariation | SquareCatalogItem; related_objects?: Array<SquareCatalogVariation | SquareCatalogItem> }>(config, `/v2/catalog/object/${encodeURIComponent(objectId)}?${query.toString()}`);
  return payload;
}

export async function retrieveSquareMerchant(config: SquarePhase1Config) {
  const payload = await squareFetch<{ merchant?: { id?: string; business_name?: string; country?: string; currency?: string } }>(config, "/v2/merchants/me");
  return payload.merchant ?? null;
}

export type SquareLocation = {
  id?: string;
  name?: string;
  status?: string;
};

export type SquarePaymentLink = {
  id?: string;
  url?: string;
  long_url?: string;
  order_id?: string;
  created_at?: string;
};

export async function listSquareLocations(config: SquarePhase1Config) {
  const payload = await squareFetch<{ locations?: SquareLocation[] }>(config, "/v2/locations");
  return payload.locations ?? [];
}

export async function createSquareCatalogPaymentLink(config: SquarePhase1Config, input: {
  idempotencyKey: string;
  locationId: string;
  catalogVariationId: string;
  quantity: number;
  description: string;
  buyerEmail?: string | null;
  referenceId?: string | null;
}) {
  const payload = await squareFetch<{ payment_link?: SquarePaymentLink }>(config, "/v2/online-checkout/payment-links", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: input.idempotencyKey,
      description: input.description,
      order: {
        location_id: input.locationId,
        reference_id: input.referenceId ?? undefined,
        line_items: [
          {
            catalog_object_id: input.catalogVariationId,
            quantity: String(Math.max(1, Math.floor(input.quantity) || 1)),
          },
        ],
      },
      pre_populated_data: input.buyerEmail ? { buyer_email: input.buyerEmail } : undefined,
      payment_note: input.description,
    }),
  });
  return payload.payment_link ?? null;
}

export async function createSquareAdHocPaymentLink(config: SquarePhase1Config, input: {
  idempotencyKey: string;
  locationId: string;
  name: string;
  quantity: number;
  priceMoney: SquareCatalogMoney;
  description: string;
  buyerEmail?: string | null;
  referenceId?: string | null;
}) {
  const payload = await squareFetch<{ payment_link?: SquarePaymentLink }>(config, "/v2/online-checkout/payment-links", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: input.idempotencyKey,
      description: input.description,
      order: {
        location_id: input.locationId,
        reference_id: input.referenceId ?? undefined,
        line_items: [
          {
            name: input.name,
            quantity: String(Math.max(1, Math.floor(input.quantity) || 1)),
            base_price_money: input.priceMoney,
          },
        ],
      },
      pre_populated_data: input.buyerEmail ? { buyer_email: input.buyerEmail } : undefined,
      payment_note: input.description,
    }),
  });
  return payload.payment_link ?? null;
}
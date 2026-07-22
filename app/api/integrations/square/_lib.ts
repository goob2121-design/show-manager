import { createHmac, timingSafeEqual } from "crypto";
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

async function squareFetch<T>(config: SquarePhase1Config, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Square-Version": "2026-07-16",
      "Authorization": `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Square API request failed with status ${response.status}.`);
  return (await response.json()) as T;
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

export type SquareOrder = {
  id?: string;
  location_id?: string;
  line_items?: SquareOrderLineItem[];
  fulfillments?: Array<{
    pickup_details?: { recipient?: { display_name?: string; email_address?: string } };
    shipment_details?: { recipient?: { display_name?: string; email_address?: string } };
  }>;
  tenders?: Array<{ customer_id?: string }>;
};

export async function retrieveSquarePayment(config: SquarePhase1Config, paymentId: string) {
  const payload = await squareFetch<{ payment?: SquarePayment }>(config, `/v2/payments/${encodeURIComponent(paymentId)}`);
  return payload.payment ?? null;
}

export async function retrieveSquareOrder(config: SquarePhase1Config, orderId: string) {
  const payload = await squareFetch<{ order?: SquareOrder }>(config, `/v2/orders/${encodeURIComponent(orderId)}`);
  return payload.order ?? null;
}

export function getOrderRecipient(order: SquareOrder | null, payment: SquarePayment | null) {
  const fulfillment = order?.fulfillments?.find((item) => item.pickup_details?.recipient || item.shipment_details?.recipient);
  const pickupRecipient = fulfillment?.pickup_details?.recipient;
  const shipmentRecipient = fulfillment?.shipment_details?.recipient;
  return {
    name: pickupRecipient?.display_name ?? shipmentRecipient?.display_name ?? null,
    email: pickupRecipient?.email_address ?? shipmentRecipient?.email_address ?? payment?.buyer_email_address ?? null,
  };
}

export function maskIdentifier(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
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
  item_variation_data?: {
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
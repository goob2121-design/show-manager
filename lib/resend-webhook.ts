import { Resend } from "resend";
import type { WebhookEventPayload } from "resend";
// @ts-expect-error Node's type-stripping test runner needs the TypeScript extension for local ESM resolution.
import { isSupportedResendEmailEventType, type SupportedResendEmailEventType } from "./reserved-seat-email-tracking.ts";

export type VerifiedResendEmailWebhookEvent = Extract<WebhookEventPayload, { type: SupportedResendEmailEventType }>;

export function getResendWebhookHeaderValues(headers: Headers) {
  return {
    id: headers.get("svix-id")?.trim() ?? "",
    timestamp: headers.get("svix-timestamp")?.trim() ?? "",
    signature: headers.get("svix-signature")?.trim() ?? "",
  };
}

export function verifyResendWebhookPayload(payload: string, headers: Headers, webhookSecret: string) {
  const headerValues = getResendWebhookHeaderValues(headers);
  if (!headerValues.id || !headerValues.timestamp || !headerValues.signature) {
    throw new Error("Missing required webhook signature headers.");
  }

  const event = new Resend("re_webhook_verification_only").webhooks.verify({
    payload,
    headers: headerValues as never,
    webhookSecret,
  });

  if (!event || typeof event !== "object" || !("type" in event) || typeof event.type !== "string") {
    throw new Error("Webhook payload is malformed.");
  }

  if (!isSupportedResendEmailEventType(event.type)) {
    throw new Error(`Unsupported webhook event type: ${event.type}`);
  }

  return event as VerifiedResendEmailWebhookEvent;
}

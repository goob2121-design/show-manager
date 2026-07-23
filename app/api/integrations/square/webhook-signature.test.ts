import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  getSquareHmacSha256SignatureHeader,
  verifySquareWebhookSignature,
  type SquarePhase1Config,
} from "@/app/api/integrations/square/_lib";

const notificationUrl =
  "https://stageflow.cumberlandmountainmusic.com/api/integrations/square/webhook";
const signatureKey = "production-test-signature-key";
const productionPayload = JSON.stringify({
  merchant_id: "PRODUCTION_TEST_MERCHANT",
  type: "payment.updated",
  event_id: "production-test-event",
  created_at: "2026-07-23T18:00:00Z",
  data: {
    type: "payment",
    id: "production-test-payment",
    object: {
      payment: {
        id: "production-test-payment",
        status: "COMPLETED",
        order_id: "production-test-order",
      },
    },
  },
});
const config: SquarePhase1Config = {
  environment: "production",
  accessToken: "unused-test-token",
  applicationId: "unused-test-application",
  webhookSignatureKey: signatureKey,
  webhookNotificationUrl: notificationUrl,
  apiBaseUrl: "https://connect.squareup.com",
};

function sign(body: string, url = notificationUrl) {
  return createHmac("sha256", signatureKey)
    .update(url + body, "utf8")
    .digest("base64");
}

test("accepts the SHA-256 signature header and ignores x-square-signature", () => {
  const headers = new Headers({
    "x-square-hmacsha256-signature": sign(productionPayload),
    "x-square-signature": "incorrect-legacy-signature",
  });
  const selected = getSquareHmacSha256SignatureHeader(headers);

  assert.equal(selected, sign(productionPayload));
  assert.equal(verifySquareWebhookSignature(productionPayload, selected, config), true);
});

test("does not use x-square-signature for SHA-256 verification", () => {
  const headers = new Headers({
    "x-square-signature": sign(productionPayload),
  });

  assert.equal(getSquareHmacSha256SignatureHeader(headers), null);
  assert.equal(
    verifySquareWebhookSignature(
      productionPayload,
      getSquareHmacSha256SignatureHeader(headers),
      config,
    ),
    false,
  );
});

test("rejects a modified raw request body", () => {
  const signature = sign(productionPayload);

  assert.equal(
    verifySquareWebhookSignature(`${productionPayload} `, signature, config),
    false,
  );
});

test("rejects a modified notification URL", () => {
  const signature = sign(productionPayload);

  assert.equal(
    verifySquareWebhookSignature(productionPayload, signature, {
      ...config,
      webhookNotificationUrl: `${notificationUrl}/changed`,
    }),
    false,
  );
});

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { getSquareDeveloperDashboardTestAcknowledgement } from "./webhook/route";
import {
  getSquareHmacSha256SignatureHeader,
  verifySquareWebhookSignature,
  type SquarePhase1Config,
} from "./_lib";

const notificationUrl =
  "https://stageflow.cumberlandmountainmusic.com/api/integrations/square/webhook";
const signatureKey = "production-test-signature-key";
const config: SquarePhase1Config = {
  environment: "production",
  accessToken: "unused-test-token",
  applicationId: "unused-test-application",
  webhookSignatureKey: signatureKey,
  webhookNotificationUrl: notificationUrl,
  apiBaseUrl: "https://connect.squareup.com",
};
const dashboardPayload = {
  merchant_id: "6SSW7HV8K2ST5",
  type: "payment.updated",
  event_id: "dashboard-sample-event",
  created_at: "2020-07-15T05:14:11.213Z",
  data: {
    type: "payment",
    id: "hYy9pRFVxpDsO1FB05SunFWUe9JZY",
    object: {
      payment: {
        id: "hYy9pRFVxpDsO1FB05SunFWUe9JZY",
        status: "COMPLETED",
        order_id: "sample-order-id",
        card_details: {
          statement_description: "SQ *DEFAULT TEST ACCOUNT",
        },
      },
    },
  },
};

function sign(body: string) {
  return createHmac("sha256", signatureKey)
    .update(notificationUrl + body, "utf8")
    .digest("base64");
}

test("acknowledges the signed official Square dashboard sample with HTTP 200", () => {
  const body = JSON.stringify(dashboardPayload);
  const headers = new Headers({
    "square-initial-delivery-timestamp": "2026-07-23T18:00:00Z",
    "x-square-hmacsha256-signature": sign(body),
  });

  assert.equal(
    verifySquareWebhookSignature(
      body,
      getSquareHmacSha256SignatureHeader(headers),
      config,
    ),
    true,
  );
  assert.deepEqual(
    getSquareDeveloperDashboardTestAcknowledgement(dashboardPayload, headers),
    { status: 200, result: "test_event_acknowledged" },
  );
});

test("does not classify a real production-like payment as a dashboard test", () => {
  const productionEvent = {
    ...dashboardPayload,
    event_id: "real-production-event",
    data: {
      ...dashboardPayload.data,
      id: "REAL_PAYMENT_ID",
      object: {
        payment: {
          ...dashboardPayload.data.object.payment,
          id: "REAL_PAYMENT_ID",
          order_id: "REAL_ORDER_ID",
          card_details: {
            statement_description: "SQ *CUMBERLAND MOUNTAIN",
          },
        },
      },
    },
  };
  const headers = new Headers({
    "square-initial-delivery-timestamp": "2026-07-23T18:00:00Z",
  });

  assert.equal(
    getSquareDeveloperDashboardTestAcknowledgement(productionEvent, headers),
    null,
  );
});

test("does not acknowledge a sample marker without Square's delivery header", () => {
  assert.equal(
    getSquareDeveloperDashboardTestAcknowledgement(
      dashboardPayload,
      new Headers(),
    ),
    null,
  );
});

test("modified or unsigned dashboard payloads fail signature validation", () => {
  const body = JSON.stringify(dashboardPayload);
  const signature = sign(body);

  assert.equal(
    verifySquareWebhookSignature(`${body} `, signature, config),
    false,
  );
  assert.equal(verifySquareWebhookSignature(body, null, config), false);
});

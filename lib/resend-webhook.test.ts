import assert from "node:assert/strict";
import test from "node:test";
import { Webhook } from "svix";

const webhookModulePromise = import(new URL("./resend-webhook.ts", import.meta.url).href);

const webhookSecret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

function signPayload(payload: string) {
  const messageId = "msg_test_123";
  const timestamp = new Date();
  const signature = new Webhook(webhookSecret).sign(messageId, timestamp, payload);

  return new Headers({
    "svix-id": messageId,
    "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
    "svix-signature": signature,
  });
}

test("valid signed Resend webhook is accepted", async () => {
  const { verifyResendWebhookPayload } = await webhookModulePromise;
  const payload = JSON.stringify({
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: {
      email_id: "re_123",
      created_at: new Date().toISOString(),
      from: "tickets@cumberlandmountainmusic.com",
      to: ["guest@example.com"],
      subject: "Select Your Reserved Seats - The Cumberland Mountain Music Show",
    },
  });

  const event = verifyResendWebhookPayload(payload, signPayload(payload), webhookSecret);
  assert.equal(event.type, "email.delivered");
  assert.equal(event.data.email_id, "re_123");
});

test("invalid webhook signature is rejected", async () => {
  const { verifyResendWebhookPayload } = await webhookModulePromise;
  const payload = JSON.stringify({
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: {
      email_id: "re_123",
      created_at: new Date().toISOString(),
      from: "tickets@cumberlandmountainmusic.com",
      to: ["guest@example.com"],
      subject: "Select Your Reserved Seats - The Cumberland Mountain Music Show",
    },
  });

  assert.throws(
    () => verifyResendWebhookPayload(payload, new Headers({
      "svix-id": "msg_test_123",
      "svix-timestamp": "1785160800",
      "svix-signature": "v1,not-a-real-signature",
    }), webhookSecret),
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  MAILING_LIST_WELCOME_SENDER,
  MAILING_LIST_WELCOME_SUBJECT,
  buildMailingListWelcomeEmail,
  sendMailingListWelcomeEmail,
} from "./mailing-list-welcome-email";
import { MANUAL_EMAIL_REPLY_TO } from "./manual-email-center";

const input = {
  subscriberId: "9fdaad20-4a6a-4446-8239-e5d37037535d",
  email: "goob2121@gmail.com",
  firstName: "Bryan",
};

test("mailing-list welcome email uses the Email Center renderer and configured CMMS sender", () => {
  const content = buildMailingListWelcomeEmail("Bryan");

  assert.equal(MAILING_LIST_WELCOME_SUBJECT, "Welcome to the Cumberland Mountain Music Show mailing list");
  assert.equal(MAILING_LIST_WELCOME_SENDER.from, "Cumberland Mountain Music Show <info@cumberlandmountainmusic.com>");
  assert.equal(MANUAL_EMAIL_REPLY_TO, "info@cumberlandmountainmusic.com");
  assert.match(content.html, /Big-Time Show &bull; Small-Town Hospitality/);
  assert.match(content.html, /Welcome to the CMMS mailing list/);
  assert.match(content.text, /Thanks, Bryan!/);
});

test("new subscriber welcome send is attempted exactly once and returns the Resend provider id", async () => {
  const calls: unknown[] = [];
  const result = await sendMailingListWelcomeEmail({ ...input, apiKey: "re_test" }, () => ({
    emails: {
      async send(payload, options) {
        calls.push({ payload, options });
        return { data: { id: "re_welcome_123" } };
      },
    },
  }));

  assert.equal(calls.length, 1);
  assert.equal(result.attempted, true);
  assert.equal(result.sent, true);
  assert.equal(result.resendMessageId, "re_welcome_123");
  assert.equal(result.errorMessage, null);
  assert.deepEqual(calls[0], {
    payload: {
      from: "Cumberland Mountain Music Show <info@cumberlandmountainmusic.com>",
      replyTo: "info@cumberlandmountainmusic.com",
      to: "goob2121@gmail.com",
      subject: "Welcome to the Cumberland Mountain Music Show mailing list",
      html: buildMailingListWelcomeEmail("Bryan").html,
      text: buildMailingListWelcomeEmail("Bryan").text,
    },
    options: { idempotencyKey: "mailing-list-welcome-9fdaad20-4a6a-4446-8239-e5d37037535d" },
  });
});

test("welcome send failure after subscriber creation is structured without throwing", async () => {
  const result = await sendMailingListWelcomeEmail({ ...input, apiKey: "re_test" }, () => ({
    emails: { async send() { return { error: { message: "domain is not verified" } }; } },
  }));

  assert.equal(result.attempted, true);
  assert.equal(result.sent, false);
  assert.equal(result.resendMessageId, null);
  assert.equal(result.errorMessage, "domain is not verified");
});

test("missing Resend configuration prevents a provider request and records a clear failure", async () => {
  let called = false;
  const result = await sendMailingListWelcomeEmail({ ...input, apiKey: undefined }, () => {
    called = true;
    return { emails: { async send() { return { data: { id: "should-not-send" } }; } } };
  });

  assert.equal(called, false);
  assert.equal(result.attempted, false);
  assert.equal(result.sent, false);
  assert.equal(result.errorMessage, "RESEND_API_KEY is not configured.");
});

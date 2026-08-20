import assert from "node:assert/strict";
import test from "node:test";

const helperPromise = import(new URL("./email-center.ts", import.meta.url).href);

test("merge fields resolve known values and retain missing fields for validation", async () => {
  const { resolveEmailCenterMergeFields, splitEmailCenterName } = await helperPromise;
  const result = resolveEmailCenterMergeFields("Hi {{first_name}} - {{seat_numbers}}", { first_name: "Whitney" });
  assert.equal(result.rendered, "Hi Whitney - {{seat_numbers}}");
  assert.deepEqual(result.unresolved, ["{{seat_numbers}}"]);
  assert.deepEqual(splitEmailCenterName("Whitney Ann Smith"), { firstName: "Whitney", lastName: "Ann Smith", fullName: "Whitney Ann Smith" });
});

test("tracking status keeps the most meaningful state without losing later history", async () => {
  const { chooseEmailCenterStatus } = await helperPromise;
  assert.equal(chooseEmailCenterStatus("delivered", "email.opened"), "opened");
  assert.equal(chooseEmailCenterStatus("clicked", "email.opened"), "clicked");
  assert.equal(chooseEmailCenterStatus("delivered", "email.bounced"), "bounced");
});

test("event fingerprints are idempotent and tracked URLs redact sensitive values", async () => {
  const { emailCenterEventFingerprint, sanitizeTrackedEmailUrl } = await helperPromise;
  assert.equal(emailCenterEventFingerprint({ providerEventId: "evt_1", resendMessageId: "re_1", eventType: "email.opened", createdAt: "now" }), "provider:evt_1");
  const first = emailCenterEventFingerprint({ resendMessageId: "re_1", eventType: "email.opened", createdAt: "now" });
  const second = emailCenterEventFingerprint({ resendMessageId: "re_1", eventType: "email.opened", createdAt: "now" });
  assert.equal(first, second);
  const safe = sanitizeTrackedEmailUrl("https://example.com/reserved-seating/private-token?token=secret&ok=yes");
  assert.equal(safe, "https://example.com/reserved-seating/[redacted]?token=%5Bredacted%5D&ok=yes");
});

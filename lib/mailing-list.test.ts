import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node native type stripping requires the explicit TypeScript extension.
import { createMailingListUnsubscribeToken, isValidMailingListEmail, normalizeMailingListEmail, verifyMailingListUnsubscribeToken } from "./mailing-list.ts";

test("mailing-list email normalization and validation are case-insensitive", () => {
  assert.equal(normalizeMailingListEmail(" Pat@Example.COM "), "pat@example.com");
  assert.equal(isValidMailingListEmail("Pat@example.com"), true);
  assert.equal(isValidMailingListEmail("not-an-email"), false);
});
test("unsubscribe tokens are opaque, signed, and reject tampering", () => {
  process.env.MAILING_LIST_TOKEN_SECRET = "test-only-secret";
  const id = "123e4567-e89b-42d3-a456-426614174000"; const token = createMailingListUnsubscribeToken(id);
  assert.notEqual(token, id); assert.equal(verifyMailingListUnsubscribeToken(token), id);
  assert.equal(verifyMailingListUnsubscribeToken(`${token}x`), null);
});

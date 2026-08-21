import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const subscribe = new URL("./subscribe/route.ts", import.meta.url);
const unsubscribe = new URL("./unsubscribe/route.ts", import.meta.url);
const subscriptionHelper = new URL("../../../../lib/mailing-list-subscription.ts", import.meta.url);
test("public signup validates, normalizes, deduplicates, and requires explicit resubscribe", async () => {
  const routeSource = await readFile(subscribe, "utf8");
  const helperSource = await readFile(subscriptionHelper, "utf8");
  const source = `${routeSource}\n${helperSource}`;
  assert.match(source, /normalizeMailingListEmail/); assert.match(source, /isValidMailingListEmail/);
  assert.match(source, /\.ilike\("email", email\)/); assert.match(source, /already_subscribed/);
  assert.match(source, /resubscribe_required/); assert.match(source, /raw\.resubscribe === true/);
  assert.match(source, /website/); assert.match(source, /limited\(key\)/); assert.match(source, /ALLOWED_ORIGINS/);
  assert.doesNotMatch(source, /reserved|ticket|assignment|finance|square/i);
});
test("unsubscribe updates only the standalone subscriber record using a signed token", async () => {
  const source = await readFile(unsubscribe, "utf8");
  assert.match(source, /verifyMailingListUnsubscribeToken/); assert.match(source, /mailing_list_subscribers/);
  assert.match(source, /status: "unsubscribed"/); assert.match(source, /unsubscribed_at: now/);
  for (const forbidden of ["show_reserved", "ticket", "assignment", "square", "finance", "check_in"]) assert.doesNotMatch(source, new RegExp(forbidden, "i"));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const notificationUrl = new URL("mailing-list-admin-notification.ts", import.meta.url);
const signupUrl = new URL("../app/api/public/mailing-list/subscribe/route.ts", import.meta.url);
const welcomeUrl = new URL("mailing-list-welcome-email.ts", import.meta.url);
const presaleUrl = new URL("mailing-list-presale-delivery.ts", import.meta.url);

test("new subscriber notification uses existing recipient and general mailing-list sender", async () => {
  const [notification, signup] = await Promise.all([readFile(notificationUrl, "utf8"), readFile(signupUrl, "utf8")]);
  assert.match(signup, /recipient: process\.env\.NOTIFY_EMAIL/);
  assert.match(notification, /from: MAILING_LIST_WELCOME_SENDER\.from/);
  assert.match(notification, /subject: MAILING_LIST_ADMIN_NOTIFICATION_SUBJECT/);
  assert.match(notification, /New CMMS Mailing List Subscriber/);
});

test("notification contains clean subscriber identity, email, source, and signup time", async () => {
  const source = await readFile(notificationUrl, "utf8");
  assert.match(source, /input\.firstName\.trim\(\), input\.lastName\.trim\(\)/);
  assert.match(source, /\|\| "Name not provided"/);
  assert.match(source, /mailto:\$\{escapeHtml\(input\.email\)\}/);
  assert.match(source, /source === "website"/);
  assert.match(source, /source === "ticket_opt_in"/);
  assert.match(source, /Signed up:/);
});

test("only new and confirmed-resubscribe success paths notify; active duplicates return first", async () => {
  const source = await readFile(signupUrl, "utf8");
  const duplicateReturn = source.indexOf('subscription.status === "already_subscribed"');
  const notification = source.indexOf("sendMailingListAdminNotification({");
  assert.ok(duplicateReturn >= 0 && duplicateReturn < notification);
  assert.match(source, /subscriptionEvent: created \? "new" : "resubscribe"/);
  assert.match(source, /if \(subscriberId\) \{[\s\S]*sendMailingListAdminNotification/);
});

test("admin notification is failure-isolated and cannot change subscriber success", async () => {
  const [notification, signup] = await Promise.all([readFile(notificationUrl, "utf8"), readFile(signupUrl, "utf8")]);
  assert.match(notification, /catch \(error\)[\s\S]*return \{ sent: false, skipped: false/);
  const sendIndex = signup.indexOf("sendMailingListAdminNotification({");
  const successIndex = signup.indexOf('status: "subscribed"', sendIndex);
  assert.ok(sendIndex >= 0 && successIndex > sendIndex);
  assert.doesNotMatch(signup.slice(sendIndex, successIndex), /throw new Error/);
});

test("notification has retry protection and includes only available presale Sent or Failed result", async () => {
  const [notification, signup] = await Promise.all([readFile(notificationUrl, "utf8"), readFile(signupUrl, "utf8")]);
  assert.match(notification, /idempotencyKey: `mailing-list-admin-\$\{input\.subscriberId\}-\$\{eventKey\}`/);
  assert.match(notification, /input\.subscriptionEvent === "new" \? "new" : `resubscribe-\$\{input\.signedUpAt\.slice\(0, 10\)\}`/);
  assert.match(signup, /presaleResult\.status === "sent" \|\| presaleResult\.status === "failed"/);
  assert.match(notification, /Presale Access Email:/);
});

test("welcome and automatic presale implementations remain present and separate", async () => {
  const [signup, welcome, presale] = await Promise.all([readFile(signupUrl, "utf8"), readFile(welcomeUrl, "utf8"), readFile(presaleUrl, "utf8")]);
  assert.match(signup, /sendMailingListWelcomeEmail/);
  assert.match(signup, /sendAutomaticMailingListPresaleAccess/);
  assert.match(welcome, /mailing-list-welcome-\$\{input\.subscriberId\}/);
  assert.match(presale, /claimError\?\.code === "23505"/);
  assert.doesNotMatch(notificationUrl.pathname, /reserved-seat/);
});

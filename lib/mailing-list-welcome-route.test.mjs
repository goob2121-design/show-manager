import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../app/api/public/mailing-list/subscribe/route.ts", import.meta.url);
const helperUrl = new URL("./mailing-list-subscription.ts", import.meta.url);

test("public mailing-list route sends welcome only for genuinely new subscribers", async () => {
  const routeSource = await readFile(routeUrl, "utf8");
  const helperSource = await readFile(helperUrl, "utf8");
  const source = `${routeSource}\n${helperSource}`;
  assert.match(source, /const created = subscription\.created/);
  assert.match(source, /created: true/);
  assert.match(source, /if \(created && subscriberId\) \{\s*welcomeEmailResult = await sendMailingListWelcomeEmail/s);
  assert.match(source, /status: "already_subscribed"/);
  assert.match(source, /return NextResponse\.json\(\{ success: true, status: "already_subscribed"/);
});

test("public mailing-list route awaits welcome send and stores non-sensitive diagnostic metadata", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /welcomeEmailResult = await sendMailingListWelcomeEmail/);
  assert.match(source, /await recordWelcomeEmailResult\(supabase, subscriberId, welcomeEmailResult\)/);
  assert.match(source, /welcome_email: \{/);
  assert.match(source, /resend_message_id: result\.resendMessageId/);
  assert.match(source, /error_message: result\.errorMessage/);
  assert.match(source, /subscriber_created: created/);
  assert.match(source, /welcome_email_sent: welcomeEmailResult\?\.sent \?\? false/);
});

test("public mailing-list route preserves subscriber success when welcome delivery fails", async () => {
  const source = await readFile(routeUrl, "utf8");
  const sendIndex = source.indexOf("welcomeEmailResult = await sendMailingListWelcomeEmail");
  const errorLogIndex = source.indexOf('console.error("Mailing-list welcome email failed."', sendIndex);
  const successIndex = source.indexOf("return NextResponse.json({", errorLogIndex);
  assert.ok(sendIndex >= 0 && errorLogIndex > sendIndex && successIndex > errorLogIndex);
  assert.doesNotMatch(source.slice(errorLogIndex, successIndex), /throw|status: 500/);
});

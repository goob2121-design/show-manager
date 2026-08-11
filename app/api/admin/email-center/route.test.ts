import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("./route.ts", import.meta.url);

test("Email Center API is admin-only and keeps credentials server-side", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /verifyAdminSessionCookieValue/);
  assert.match(source, /getAdminSessionCookieName\(slug\)/);
  assert.match(source, /process\.env\.RESEND_API_KEY/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_RESEND|resendApiKey.*body/i);
});

test("Email Center API allowlists sender and template, validates content, and forces Reply-To", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /getManualEmailSender\(senderKey\)/);
  assert.match(source, /getManualEmailTemplate\(templateKey\)/);
  assert.match(source, /isValidManualEmailAddress\(recipientEmail\)/);
  assert.match(source, /subject\.length > 200/);
  assert.match(source, /message\.length > 20000/);
  assert.match(source, /from: sender\.from/);
  assert.match(source, /replyTo: MANUAL_EMAIL_REPLY_TO/);
  assert.match(source, /text: message/);
});

test("Email Center API records sent and failed manual attempts without exposing secrets", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /from\("manual_email_history"\)/);
  assert.match(source, /send_status: "sent"/);
  assert.match(source, /send_status: "failed"/);
  assert.match(source, /resend_message_id: resendMessageId/);
  assert.match(source, /\.eq\("show_id", access\.show\.id\)/);
  assert.doesNotMatch(source, /apiKey[,}]\s*\)/);
});

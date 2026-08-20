import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("./route.ts", import.meta.url);

test("Email Center API remains admin-only with server-only credentials", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /verifyAdminSessionCookieValue/);
  assert.match(source, /getAdminSessionCookieName\(slug\)/);
  assert.match(source, /process\.env\.RESEND_API_KEY/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_RESEND|resendApiKey.*body/i);
});

test("Email Center API loads show-scoped recipients from existing operational data", async () => {
  const source = await readFile(routePath, "utf8");
  for (const table of ["show_reserved_seating_links","show_reserved_seat_assignments","show_comp_tickets","guest_profiles","show_sponsors"]) assert.match(source, new RegExp(`from\\("${table}"\\)`));
  assert.match(source, /mode"\) === "recipients"/);
  assert.match(source, /buildReservedSeatSelectionUrl/);
  assert.doesNotMatch(source, /create table|contact_database/i);
});

test("Email Center validates rendered content and preserves exact immutable snapshots", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /getManualEmailSender\(senderKey\)/);
  assert.match(source, /getManualEmailTemplate\(templateKey\)/);
  assert.match(source, /findUnresolvedEmailCenterMergeFields/);
  assert.match(source, /Resolve merge field:/);
  assert.match(source, /subject: resolvedSubject\.rendered/);
  assert.match(source, /message_text: renderedEmail\.text/);
  assert.match(source, /reply_to: MANUAL_EMAIL_REPLY_TO/);
  assert.match(source, /html: renderedEmail\.html/);
  assert.match(source, /renderEmailCenterEmail/);
  assert.match(source, /text: renderedEmail\.text/);
});

test("Email Center claims once and stores provider ID on the exact delivery", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /request_id: requestId/);
  assert.match(source, /claimError\.code === "23505"/);
  assert.match(source, /idempotencyKey: `email-center-\$\{requestId\}`/);
  assert.match(source, /email_center_delivery_id/);
  assert.match(source, /\.eq\("id", delivery\.id\)/);
  assert.match(source, /resend_message_id: resendMessageId/);
  assert.match(source, /send_status: "failed"/);
});

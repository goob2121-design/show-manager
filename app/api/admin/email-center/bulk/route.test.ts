import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const routePath = new URL("./route.ts", import.meta.url);
test("bulk send is admin-only and rebuilds recipients from authoritative show data", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /verifyAdminSessionCookieValue/); assert.match(source, /loadEmailCenterRecipients/);
  assert.match(source, /recipientsForEmailCenterAudience/); assert.match(source, /selectedRecipientIds/);
  assert.doesNotMatch(source, /body\.recipients|body\.mergeFields|body\.recipientEmail/);
});
test("operation claim prevents duplicates and links one delivery per ready recipient", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /manual_email_bulk_operations/); assert.match(source, /operationError\.code === "23505"/);
  assert.match(source, /manual_email_history/); assert.match(source, /bulk_operation_id: operationId/);
  assert.match(source, /deliveryId: crypto\.randomUUID/); assert.match(source, /requestId: crypto\.randomUUID/);
  assert.match(source, /subject: item\.subject/); assert.match(source, /message_text: item\.renderedEmail\.text/);
});
test("Resend batches preserve unique provider IDs and handle chunk failures", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /offset \+= 100/); assert.match(source, /resend\.batch\.send/);
  assert.match(source, /email-center-bulk-/); assert.match(source, /providerRows\[index\]/);
  assert.match(source, /resend_message_id: providerId/); assert.match(source, /send_status: "failed"/);
  assert.match(source, /failedCount \+= 1/);
  assert.match(source, /html: item\.renderedEmail\.html/); assert.match(source, /text: item\.renderedEmail\.text/);
  assert.match(source, /renderEmailCenterEmail/);
});

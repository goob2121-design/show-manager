import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webhookPath = new URL("./route.ts", import.meta.url);

test("verified Resend webhook routes unmatched provider IDs to isolated Email Center tracking", async () => {
  const source = await readFile(webhookPath, "utf8");
  assert.match(source, /verifyResendWebhookPayload/);
  assert.match(source, /from\("reserved_seat_email_deliveries"\)/);
  assert.match(source, /from\("show_reserved_seating_links"\)/);
  assert.match(source, /if \(!links\?\.length\)/);
  assert.match(source, /storeEmailCenterEvent/);
  assert.match(source, /from\("manual_email_history"\)[\s\S]*?eq\("resend_message_id", resendEmailId\)/);
  assert.match(source, /from\("manual_email_events"\)\.insert/);
  assert.match(source, /event_fingerprint: fingerprint/);
  assert.match(source, /sanitizeTrackedEmailUrl/);
});

test("Email Center webhook association is exact and cannot mutate operational records", async () => {
  const source = await readFile(webhookPath, "utf8");
  const helper = source.slice(source.indexOf("async function storeEmailCenterEvent"), source.indexOf("export async function POST"));
  assert.match(helper, /matches.*length !== 1/);
  assert.match(helper, /\.eq\("id", delivery\.id\)/);
  assert.doesNotMatch(helper, /show_reserved_seating_links.*update|show_reserved_seat_assignments|submitted_at|ticket_count|square|check.?in|finance|send\(/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const serviceUrl = new URL("./scheduled-email-campaign.ts", import.meta.url);
const routeUrl = new URL("../app/api/admin/email-center/scheduled-general/route.ts", import.meta.url);
const cronUrl = new URL("../app/api/cron/scheduled-presale-campaigns/route.ts", import.meta.url);
const uiUrl = new URL("../app/components/email-center.tsx", import.meta.url);
const scheduledUiUrl = new URL("../app/components/general-scheduled-email-campaigns.tsx", import.meta.url);
const migrationUrl = new URL("../supabase/migrations/20260901_add_scheduled_email_campaigns.sql", import.meta.url);

test("general scheduled campaign stores an immutable snapshot and current audience key", async () => {
  const [route, sql] = await Promise.all([readFile(routeUrl, "utf8"), readFile(migrationUrl, "utf8")]);
  assert.match(sql, /create table if not exists public\.scheduled_email_campaigns/);
  for (const field of ["template_key", "audience_key", "subject_template", "message_template", "scheduled_for", "approved_at", "from_address", "show_id"]) assert.match(sql, new RegExp(field));
  assert.match(route, /scheduled_email_campaigns"\)\.insert/);
  assert.match(route, /loadEmailCenterRecipients/);
});

test("execution re-evaluates authoritative recipients and respects current mailing-list state", async () => {
  const service = await readFile(serviceUrl, "utf8");
  assert.match(service, /loadEmailCenterRecipients\(input\.supabase, show, input\.origin\)/);
  assert.match(service, /recipientsForEmailCenterAudience\(allRecords, campaign\.audience_key\)/);
  assert.match(service, /mailingListUnsubscribeUrl/);
  assert.doesNotMatch(service, /selected_recipient_ids|recipient_snapshot/);
});

test("future campaigns are selected only when due and one atomic claim prevents overlap", async () => {
  const service = await readFile(serviceUrl, "utf8");
  assert.match(service, /\.eq\("id", input\.campaign\.id\)\.eq\("status", "scheduled"\)/);
  assert.match(service, /if \(trigger === "automatic"\) claim = claim\.lte\("scheduled_for", startedAt\)/);
  assert.match(service, /\.eq\("status", "scheduled"\)\.lte\("scheduled_for", now\.toISOString\(\)\)/);
  assert.match(service, /idempotencyKey: `scheduled-email-\$\{campaign\.id\}-\$\{offset \/ 100\}`/);
});

test("manual Send Now completes the canonical campaign and cannot be scheduled again", async () => {
  const [service, route] = await Promise.all([readFile(serviceUrl, "utf8"), readFile(routeUrl, "utf8")]);
  assert.match(route, /trigger: "manual"/);
  assert.match(route, /\.eq\("status", "scheduled"\)\.maybeSingle\(\)/);
  assert.match(service, /manually_sent_at: trigger === "manual" \? completedAt : null/);
  assert.match(service, /\.eq\("status", "processing"\)\.eq\("delivery_trigger", trigger\)/);
});

test("cancel is audit-preserving and prevents future scheduler delivery", async () => {
  const route = await readFile(routeUrl, "utf8");
  assert.match(route, /status: "cancelled", cancelled_at: now/);
  assert.match(route, /\.eq\("status", "scheduled"\)/);
  assert.doesNotMatch(route, /\.delete\(/);
});

test("the existing daily cron processes both automatic presale and general campaigns", async () => {
  const cron = await readFile(cronUrl, "utf8");
  assert.match(cron, /processDueScheduledPresaleCampaigns/);
  assert.match(cron, /processDueScheduledEmailCampaigns/);
});

test("compose and Scheduled Emails UI disclose daily timing and recipient re-evaluation", async () => {
  const [compose, scheduled] = await Promise.all([readFile(uiUrl, "utf8"), readFile(scheduledUiUrl, "utf8")]);
  for (const text of ["Schedule Send", "Send date \\(Eastern\\)", "Recipients will be re-evaluated at send time", "once-daily Vercel Hobby scheduler"]) assert.match(compose, new RegExp(text));
  for (const text of ["Expected send", "Currently eligible", "Send Now", "Cancel Scheduled Send", "Completed"]) assert.match(scheduled, new RegExp(text));
});

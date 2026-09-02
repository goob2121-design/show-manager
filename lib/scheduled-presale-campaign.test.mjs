import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260824_add_scheduled_presale_campaigns.sql", import.meta.url);
const serviceUrl = new URL("./scheduled-presale-campaign.ts", import.meta.url);
const adminRouteUrl = new URL("../app/api/admin/email-center/scheduled/route.ts", import.meta.url);
const cronRouteUrl = new URL("../app/api/cron/scheduled-presale-campaigns/route.ts", import.meta.url);
const componentUrl = new URL("../app/components/scheduled-email-campaigns.tsx", import.meta.url);

test("scheduled presale migration is forward-only and stores one durable snapshot per show", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table if not exists public\.scheduled_presale_campaigns/);
  assert.match(sql, /scheduled_presale_campaigns_show_unique unique \(show_id\)/);
  for (const field of ["subject_template", "heading_template", "message_template", "cta_label_template", "cta_url_template", "show_name_snapshot", "show_date_snapshot", "presale_starts_at_snapshot", "public_sale_starts_at_snapshot", "ticket_url_snapshot"]) assert.match(sql, new RegExp(field));
  assert.match(sql, /'scheduled', 'processing', 'completed', 'failed', 'cancelled'/);
  assert.doesNotMatch(sql, /drop table|drop column|delete from|truncate/i);
  assert.match(sql, /revoke all on table public\.scheduled_presale_campaigns from public, anon, authenticated/);
});

test("admin scheduling is authenticated, server-authoritative, and uses the fixed launch template and audience", async () => {
  const source = await readFile(adminRouteUrl, "utf8");
  assert.match(source, /verifyAdminSessionCookieValue/);
  assert.match(source, /getManualEmailTemplate\("presale_early_access"\)/);
  assert.match(source, /audience_key: "mailing_list_subscribers"/);
  assert.match(source, /scheduled_for: access\.show\.presale_starts_at/);
  assert.match(source, /cta_url_template: "\{\{ticket_link\}\}"/);
  assert.match(source, /validatePresaleEmailFields\(fields\)/);
  assert.match(source, /recipient_count_at_schedule: audience\.recipients\.length/);
  assert.doesNotMatch(source, /body\.(?:subject|message|ctaUrl|audienceKey|scheduledFor)/);
});

test("current recipients are queried from active mailing-list state and are never client supplied", async () => {
  const [route, service] = await Promise.all([readFile(adminRouteUrl, "utf8"), readFile(serviceUrl, "utf8")]);
  assert.match(route, /from\("mailing_list_subscribers"\).*\.eq\("status", "active"\)/s);
  assert.match(service, /subscribers\.filter\(\(row\) => row\.status === "active"\)/);
  assert.match(service, /recipientsForEmailCenterAudience\(records, "mailing_list_subscribers"\)/);
  assert.match(service, /isValidManualEmailAddress\(recipient\.email\)/);
  assert.doesNotMatch(route, /selectedRecipientIds|recipientEmails/);
});

test("executor waits for the due time and atomically claims scheduled campaigns once", async () => {
  const source = await readFile(serviceUrl, "utf8");
  assert.match(source, /\.eq\("status", "scheduled"\)\.lte\("scheduled_for", startedAt\)\.select\("\*"\)\.maybeSingle\(\)/);
  assert.match(source, /status: "processing"/);
  assert.match(source, /if \(!claimed\) return \{ status: "not_claimed"/);
  assert.match(source, /scheduled-presale-\$\{campaign\.id\}-\$\{offset \/ 100\}/);
});

test("executor enforces effective presale state and authoritative ticket safety", async () => {
  const source = await readFile(serviceUrl, "utf8");
  assert.match(source, /getEffectiveTicketSaleState\(show, now\)/);
  assert.match(source, /saleState\.manualOverride/);
  assert.match(source, /saleState\.status !== "presale"/);
  assert.match(source, /Public ticket sales have already begun/);
  assert.match(source, /\^https:\\\/\\\//);
  assert.match(source, /currentTicketUrl !== campaign\.ticket_url_snapshot/);
});

test("launch and automatic new-subscriber delivery share the same durable recipient/show claim", async () => {
  const [scheduled, automatic] = await Promise.all([readFile(serviceUrl, "utf8"), readFile(new URL("./mailing-list-presale-delivery.ts", import.meta.url), "utf8")]);
  for (const source of [scheduled, automatic]) {
    assert.match(source, /from\("mailing_list_presale_deliveries"\)\.insert/);
    assert.match(source, /mailing-list-presale-\$\{(?:show|currentShow)\.id\}-\$\{(?:subscriberId|input\.subscriberId)\}/);
    assert.match(source, /23505/);
  }
});

test("scheduled delivery reuses Email Center bulk history, renderer, tracking IDs, and unsubscribe links", async () => {
  const source = await readFile(serviceUrl, "utf8");
  assert.match(source, /manual_email_bulk_operations/);
  assert.match(source, /manual_email_history/);
  assert.match(source, /renderEmailCenterRecipient/);
  assert.match(source, /renderEmailCenterEmail/);
  assert.match(source, /mailingListUnsubscribeUrl/);
  assert.match(source, /email_center_delivery_id/);
  assert.match(source, /bulk_operation_id/);
  assert.match(source, /resend\.batch\.send/);
});

test("scheduled snapshots drive preview and final rendering while recipients remain current", async () => {
  const [service, component] = await Promise.all([readFile(serviceUrl, "utf8"), readFile(componentUrl, "utf8")]);
  assert.match(service, /snapshotShow: ShowRow/);
  assert.match(service, /name: campaign\.show_name_snapshot/);
  assert.match(service, /ticket_link: campaign\.ticket_url_snapshot/);
  assert.match(service, /presale_access_code: campaign\.presale_access_code_snapshot/);
  assert.match(component, /presale_code: campaign\.presale_access_code_snapshot \?\? ""/);
  assert.match(component, /Preview Scheduled Email/);
  assert.match(component, /Preview Hi there fallback/);
  assert.match(component, /campaign\.message_template/);
  assert.match(component, /campaign\.ticket_url_snapshot/);
});

test("cancellation preserves the row and only transitions a scheduled campaign", async () => {
  const source = await readFile(adminRouteUrl, "utf8");
  assert.match(source, /status: "cancelled"/);
  assert.match(source, /\.eq\("status", "scheduled"\)/);
  assert.doesNotMatch(source, /scheduled_presale_campaigns"\)\.delete/);
  assert.match(source, /Only a scheduled campaign can be cancelled/);
});

test("cron execution requires the Vercel bearer secret and exposes no subscriber data", async () => {
  const [route, vercel] = await Promise.all([readFile(cronRouteUrl, "utf8"), readFile(new URL("../vercel.json", import.meta.url), "utf8")]);
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /request\.headers\.get\("authorization"\) !== `Bearer \$\{secret\}`/);
  assert.match(route, /status: 401/);
  assert.doesNotMatch(route, /recipients|mailing_list_subscribers/);
  assert.match(vercel, /scheduled-presale-campaigns/);
  assert.match(vercel, /"schedule": "15 4 \* \* \*"/);
  assert.doesNotMatch(vercel, /\*\/5/);
});

test("Scheduled Emails UI shows count, current audience, recipients, preview, statuses, and cancellation", async () => {
  const source = await readFile(componentUrl, "utf8");
  for (const text of ["Scheduled Emails", "Currently Eligible", "View Recipients", "Preview Scheduled Email", "Cancel Scheduled Send", "Final recipients are re-evaluated at send time", "Schedule Presale Email"]) assert.match(source, new RegExp(text));
  for (const status of ["scheduled", "processing", "completed", "failed", "cancelled"]) assert.match(source, new RegExp(status));
});

test("Hobby UI distinguishes presale opening from the next daily automatic run", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /Presale opens:/);
  assert.match(source, /Next automatic send:/);
  assert.match(source, /nextDailyPresaleSchedulerRun/);
  assert.match(source, /Vercel Hobby runs this scheduler once daily/);
  assert.match(source, /next actual available scheduler run/);
  assert.match(source, /Automatic delivery will not occur until/);
});

test("authenticated Send Now uses the same due-time-gated executor and confirmation", async () => {
  const [route, component, service] = await Promise.all([readFile(adminRouteUrl, "utf8"), readFile(componentUrl, "utf8"), readFile(serviceUrl, "utf8")]);
  assert.match(route, /verifyAdminSessionCookieValue/);
  assert.match(route, /body\.action\) === "send_now"/);
  assert.match(route, /processScheduledPresaleCampaign/);
  assert.match(component, /window\.confirm\(`SEND NOW/);
  assert.match(component, /Date\.now\(\) < new Date\(campaign\.scheduled_for\)\.getTime\(\)/);
  assert.match(service, /\.lte\("scheduled_for", startedAt\)/);
  assert.match(service, /\.eq\("status", "scheduled"\)/);
});

test("manual Send Now atomically claims and completes the canonical scheduled campaign", async () => {
  const [route, service] = await Promise.all([readFile(adminRouteUrl, "utf8"), readFile(serviceUrl, "utf8")]);
  assert.match(route, /trigger: "manual"/);
  assert.match(route, /\.eq\("status", "scheduled"\)\.maybeSingle\(\)/);
  assert.match(service, /const deliveryTrigger = input\.trigger \?\? "automatic"/);
  assert.match(service, /delivery_trigger: deliveryTrigger/);
  assert.match(service, /\.eq\("status", "scheduled"\)\.lte\("scheduled_for", startedAt\)/);
  assert.match(service, /if \(!claimed\) return \{ status: "not_claimed"/);
  assert.match(service, /manually_sent_at: deliveryTrigger === "manual" \? completedAt : null/);
  assert.match(service, /\.eq\("status", "processing"\)\.eq\("delivery_trigger", deliveryTrigger\)/);
});

test("completed manual campaigns show actual completion and no future automatic-send promise", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /campaign\.status === "completed" \? <p>/);
  assert.match(source, /Sent manually:/);
  assert.match(source, /campaign\.manually_sent_at/);
  assert.match(source, /campaign\.status === "completed" \? "Completed"/);
  assert.match(source, /: <p><span className="text-slate-400">Next automatic send:<\/span>/);
});

test("delivery-trigger migration is forward-only and preserves existing campaign history", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260901_add_scheduled_presale_delivery_trigger.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists delivery_trigger text/);
  assert.match(sql, /add column if not exists manually_sent_at timestamptz/);
  assert.match(sql, /delivery_trigger in \('automatic', 'manual'\)/);
  assert.doesNotMatch(sql, /delete from|drop table|drop column|truncate/i);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serviceUrl = new URL("./mailing-list-presale-resend.ts", import.meta.url);
const routeUrl = new URL("../app/api/admin/mailing-list/[subscriberId]/presale-resend/route.ts", import.meta.url);
const detailUrl = new URL("../app/api/admin/mailing-list/[subscriberId]/route.ts", import.meta.url);
const migrationUrl = new URL("../supabase/migrations/20260905_add_mailing_list_presale_delivery_attempts.sql", import.meta.url);

test("manual resend migration preserves original uniqueness and creates isolated child attempts", async () => {
  const [sql, originalSql] = await Promise.all([readFile(migrationUrl, "utf8"), readFile(new URL("../supabase/migrations/20260822_add_mailing_list_presale_deliveries.sql", import.meta.url), "utf8")]);
  assert.match(sql, /create table if not exists public\.mailing_list_presale_delivery_attempts/);
  assert.match(sql, /presale_delivery_id uuid not null references public\.mailing_list_presale_deliveries/);
  assert.match(sql, /unique \(request_id\)/);
  assert.match(sql, /unique \(provider_idempotency_key\)/);
  assert.match(sql, /resend_id_unique/);
  assert.match(sql, /presale_delivery_attempt_id uuid/);
  assert.doesNotMatch(sql, /drop constraint.*subscriber_show|drop index.*subscriber_show/i);
  assert.match(originalSql, /unique \(subscriber_id, show_id\)/);
});

test("resend uses current authoritative subscriber and show data after a durable claim", async () => {
  const source = await readFile(serviceUrl, "utf8");
  assert.match(source, /mailing_list_subscribers[\s\S]*select\("id,email,first_name,status"\)/);
  assert.match(source, /mailing_list_presale_deliveries[\s\S]*eq\("subscriber_id", subscriber\.id\)/);
  assert.match(source, /from\("shows"\)[\s\S]*presale_access_code/);
  assert.match(source, /effectiveTicketSaleStatus\(show, now\) !== "presale"/);
  assert.match(source, /show\.show_date < easternDateKey\(now\)/);
  assert.match(source, /\^https:\\\/\\\//);
  const claim = source.indexOf('from("mailing_list_presale_delivery_attempts").insert');
  const send = source.indexOf("sendMailingListPresaleAccessEmail({");
  assert.ok(claim >= 0 && claim < send);
  assert.match(source, /mailing-list-presale-resend-\$\{attemptId\}/);
  assert.match(source, /presaleCode: show\.presale_access_code/);
  assert.match(source, /email: recipient/);
});

test("resend is admin-only, validates IDs, and never trusts recipient/show/presale fields", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /verifyAdminSessionCookieValue/);
  assert.match(source, /every\(validUuid\)/);
  assert.doesNotMatch(source, /body\.(?:recipient|email|ticketUrl|presaleCode|showName|presaleStatus)/);
});

test("subscriber detail is exact, safe, and includes all deliveries, attempts, and lifecycle events", async () => {
  const source = await readFile(detailUrl, "utf8");
  assert.match(source, /eq\("id", subscriberId\)\.maybeSingle/);
  assert.match(source, /eq\("subscriber_id", subscriberId\)\.order\("created_at"/);
  assert.match(source, /attempts:mailing_list_presale_delivery_attempts/);
  assert.match(source, /events:mailing_list_presale_delivery_events/);
  assert.doesNotMatch(source, /\.select\([^\n]*metadata/);
  assert.doesNotMatch(source, /\.limit\(50\)/);
});

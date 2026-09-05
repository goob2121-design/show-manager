import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("./route.ts", import.meta.url);
const migrationUrl = new URL("../../../../../supabase/migrations/20260905_add_mailing_list_presale_delivery_events.sql", import.meta.url);

test("verified unmatched events next try exact mailing-list presale provider matching", async () => {
  const source = await readFile(routeUrl, "utf8");
  const reserved = source.indexOf('from("reserved_seat_email_deliveries")');
  const manual = source.indexOf("storeEmailCenterEvent(supabase");
  const presale = source.indexOf("storeMailingListPresaleEvent(supabase");
  assert.ok(reserved >= 0 && reserved < manual && manual < presale);
  assert.match(source, /from\("mailing_list_presale_deliveries"\)[\s\S]*?eq\("resend_message_id", resendEmailId\)/);
  assert.match(source, /from\("mailing_list_presale_delivery_events"\)\.insert/);
  assert.match(source, /sanitizeTrackedEmailUrl\(clickedUrl\)/);
  assert.match(source, /event_fingerprint: fingerprint/);
  assert.match(source, /if \(!presaleResult\.matched\) console\.warn\("Resend webhook received for unmatched email\./);
});

test("new automatic and scheduled claims record their source without changing historical rows", async () => {
  const automatic = await readFile(new URL("../../../../../lib/mailing-list-presale-delivery.ts", import.meta.url), "utf8");
  const scheduled = await readFile(new URL("../../../../../lib/scheduled-presale-campaign.ts", import.meta.url), "utf8");
  assert.match(automatic, /delivery_source: "automatic_signup"/);
  assert.match(scheduled, /delivery_source: "scheduled_campaign"/);
});

test("presale webhook storage is append-only and does not alter sends or operations", async () => {
  const source = await readFile(routeUrl, "utf8");
  const helper = source.slice(source.indexOf("async function storeMailingListPresaleEvent"), source.indexOf("export async function POST"));
  assert.doesNotMatch(helper, /\.update\(|emails\.send|ticket_count|seat_assignment|square|finance|check.?in/i);
  assert.match(helper, /isDuplicateInsertError\(insertError\)/);
});

test("migration constrains events, deduplicates retries, and keeps historical source unknown", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const type of ["email.sent", "email.delivered", "email.delivery_delayed", "email.complained", "email.bounced", "email.opened", "email.clicked", "email.failed"]) assert.match(sql, new RegExp(type.replace(".", "\\.")));
  assert.match(sql, /event_fingerprint text not null/);
  assert.match(sql, /events_fingerprint_unique/);
  assert.match(sql, /delivery_source is null/);
  assert.doesNotMatch(sql, /update public\.mailing_list_presale_deliveries[\s\S]*delivery_source/i);
});

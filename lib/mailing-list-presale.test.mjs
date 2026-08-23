import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const deliveryUrl = new URL("mailing-list-presale-delivery.ts", import.meta.url);
const emailUrl = new URL("mailing-list-presale-email.ts", import.meta.url);
const signupUrl = new URL("../app/api/public/mailing-list/subscribe/route.ts", import.meta.url);
const statusRouteUrl = new URL("../app/api/public/ticket-sales-status/route.ts", import.meta.url);
const migrationUrl = new URL("../supabase/migrations/20260822_add_mailing_list_presale_deliveries.sql", import.meta.url);

test("active presale reuses centralized effective status and exact configured time windows", async () => {
  const source = await readFile(deliveryUrl, "utf8");
  assert.match(source, /effectiveTicketSaleStatus\(show, now\) === "presale"/);
  assert.doesNotMatch(source, /nowTime|presaleStart|publicStart/);
});

test("delivery uses the established upcoming show and its existing ticket link", async () => {
  const source = await readFile(deliveryUrl, "utf8");
  assert.match(source, /select\("id,name,show_date,ticket_link,ticket_sale_status,presale_starts_at,public_sale_starts_at"\)/);
  assert.match(source, /\.eq\("is_archived", false\)\.gte\("show_date", today\)\.order\("show_date", \{ ascending: true \}\)\.limit\(1\)/);
  assert.match(source, /const ticketUrl = currentShow\.ticket_link\?\.trim\(\) \?\? ""/);
  assert.match(source, /ticketUrl,/);
});

test("private delivery claim atomically prevents one subscriber receiving a show presale twice", async () => {
  const [source, sql] = await Promise.all([readFile(deliveryUrl, "utf8"), readFile(migrationUrl, "utf8")]);
  assert.match(sql, /unique \(subscriber_id, show_id\)/);
  assert.match(sql, /revoke all on table public\.mailing_list_presale_deliveries from public, anon, authenticated/);
  assert.match(source, /from\("mailing_list_presale_deliveries"\)\.insert/);
  assert.match(source, /claimError\?\.code === "23505"/);
  assert.match(source, /mailing-list-presale-\$\{currentShow\.id\}-\$\{input\.subscriberId\}/);
});

test("presale email reuses the mailing-list sender and branded renderer with conversational copy", async () => {
  const source = await readFile(emailUrl, "utf8");
  assert.match(source, /from: MAILING_LIST_WELCOME_SENDER\.from/);
  assert.match(source, /replyTo: MANUAL_EMAIL_REPLY_TO/);
  assert.match(source, /MAILING_LIST_PRESALE_SUBJECT = "Your CMMS Early Access Ticket Link"/);
  assert.match(source, /ctaLabel: "EARLY ACCESS TICKETS"/);
  assert.match(source, /ctaUrl: input\.ticketUrl/);
  assert.match(source, /Since you're on the CMMS Mailing List, I wanted to send you the early-access ticket link/);
  assert.match(source, /Tickets open to the general public on/);
  assert.match(source, /Hi \$\{input\.firstName\.trim\(\)\},/);
  assert.match(source, /"Hi there,"/);
  assert.doesNotMatch(source, /Gmail users|future CMMS emails in Primary|check Promotions, Spam, or Social/);
});

test("signup sends only for new or confirmed resubscribed contacts and remains successful on delivery failure", async () => {
  const [signup, delivery] = await Promise.all([readFile(signupUrl, "utf8"), readFile(deliveryUrl, "utf8")]);
  const duplicateReturn = signup.indexOf('subscription.status === "already_subscribed"');
  const automaticSend = signup.indexOf("sendAutomaticMailingListPresaleAccess({");
  const successResponse = signup.indexOf("return NextResponse.json({", automaticSend);
  assert.ok(duplicateReturn >= 0 && duplicateReturn < automaticSend);
  assert.ok(automaticSend >= 0 && automaticSend < successResponse);
  assert.match(signup, /if \(subscriberId\) \{[\s\S]*sendAutomaticMailingListPresaleAccess/);
  assert.match(delivery, /catch \(error\) \{[\s\S]*return \{ status: "failed" as const/);
});

test("public ticket status remains free of the private purchase link", async () => {
  const source = await readFile(statusRouteUrl, "utf8");
  assert.doesNotMatch(source, /ticket_link|ticketUrl|ticket_url/i);
  assert.match(source, /select\("slug,name,show_date,ticket_sale_status,presale_starts_at,public_sale_starts_at"\)/);
});

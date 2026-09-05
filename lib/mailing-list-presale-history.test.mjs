import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiUrl = new URL("../app/api/admin/mailing-list/route.ts", import.meta.url);
const uiUrl = new URL("../app/components/mailing-list-admin.tsx", import.meta.url);
const deliveryUrl = new URL("mailing-list-presale-delivery.ts", import.meta.url);

test("Mailing List admin exposes a collapsed Presale Delivery History summary", async () => {
  const source = await readFile(uiUrl, "utf8");
  assert.match(source, /<details className="group rounded-2xl/);
  assert.doesNotMatch(source, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(source, /Presale Delivery History/);
  assert.match(source, /presaleSummary\.sent\} Sent · \{presaleSummary\.failed\} Failed/);
  assert.match(source, /item\.send_status === "accepted"/);
  assert.match(source, /item\.send_status === "failed"/);
  assert.match(source, /item\.send_status === "pending"/);
});

test("expanded history displays subscriber, email, show, actual status, and newest attempt fields", async () => {
  const source = await readFile(uiUrl, "utf8");
  assert.match(source, /delivery\.subscriber\?\.first_name/);
  assert.match(source, /delivery\.subscriber\?\.last_name/);
  assert.match(source, /\.join\(" "\) \|\| "—"/);
  assert.match(source, /mailto:\$\{delivery\.recipient\}/);
  assert.match(source, /formatShow\(delivery\)/);
  assert.match(source, /deliveryStatusLabel\(delivery\.send_status\)/);
  assert.match(source, /delivery\.sent_at \?\? delivery\.failed_at \?\? delivery\.created_at/);
  assert.match(source, /status === "accepted" \? "Sent" : status === "failed" \? "Failed" : "Sending"/);
});

test("failure details appear only for failed deliveries with a stored reason", async () => {
  const source = await readFile(uiUrl, "utf8");
  assert.match(source, /delivery\.error_message \?/);
  assert.match(source, /View lifecycle/);
  assert.match(source, /Error:/);
  assert.doesNotMatch(source, /raw_provider|api_key|provider_idempotency_key|ticket_url_snapshot/);
});

test("history API is authenticated, private, newest-first, and limited to 50", async () => {
  const source = await readFile(apiUrl, "utf8");
  const authorization = source.indexOf("if (!(await authorized(slug)))");
  const historyQuery = source.indexOf('from("mailing_list_presale_deliveries")');
  assert.ok(authorization >= 0 && authorization < historyQuery);
  assert.match(source, /\.order\("created_at", \{ ascending: false \}\)\.limit\(50\)/);
  assert.match(source, /subscriber:mailing_list_subscribers\(first_name,last_name\)/);
  assert.match(source, /show:shows\(name,show_date\)/);
  const selected = source.match(/\.select\("id,subscriber_id,recipient,send_status,resend_message_id,delivery_source,error_message,sent_at,failed_at,created_at,[^"]+"\)/)?.[0] ?? "";
  assert.doesNotMatch(selected, /ticket_url_snapshot|provider_idempotency_key|show_id/);
  assert.match(selected, /events:mailing_list_presale_delivery_events/);
});

test("history UI is read-only and switches to cards on mobile without page overflow", async () => {
  const source = await readFile(uiUrl, "utf8");
  assert.match(source, /className="grid gap-3 md:hidden"/);
  assert.match(source, /className="hidden overflow-x-auto md:block"/);
  const historyStart = source.indexOf("Presale Delivery History");
  const addForm = source.indexOf("<form onSubmit", historyStart);
  const historyBlock = source.slice(historyStart, addForm);
  assert.doesNotMatch(historyBlock, />Resend<|>Retry<|>Delete<|>Edit</);
});

test("automatic sending and duplicate-protection service remains separate from history display", async () => {
  const [api, ui, delivery] = await Promise.all([readFile(apiUrl, "utf8"), readFile(uiUrl, "utf8"), readFile(deliveryUrl, "utf8")]);
  assert.doesNotMatch(api, /sendAutomaticMailingListPresaleAccess|sendMailingListPresaleAccessEmail/);
  assert.doesNotMatch(ui, /sendAutomaticMailingListPresaleAccess|providerIdempotencyKey/);
  assert.match(delivery, /claimError\?\.code === "23505"/);
  assert.match(delivery, /providerIdempotencyKey/);
});

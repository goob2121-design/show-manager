import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const migration = new URL("../supabase/migrations/20260819_add_mailing_list_subscribers.sql", import.meta.url);
const emailRoute = new URL("../app/api/admin/email-center/route.ts", import.meta.url);
const bulkRoute = new URL("../app/api/admin/email-center/bulk/route.ts", import.meta.url);
test("mailing-list storage is separate and active subscribers form a dynamic audience", async () => {
  const [sql, email, bulk] = await Promise.all([readFile(migration,"utf8"),readFile(emailRoute,"utf8"),readFile(bulkRoute,"utf8")]);
  assert.match(sql,/create table if not exists public\.mailing_list_subscribers/); assert.match(sql,/unique index.*lower\(btrim\(email\)\)/s);
  assert.doesNotMatch(sql,/alter table public\.show_reserved|alter table public\.tickets/i);
  assert.match(email,/from\("mailing_list_subscribers"\).*eq\("status", "active"\)/s);
  assert.match(bulk,/mailingListUnsubscribeUrl/); assert.match(bulk,/audienceKey === "mailing_list_subscribers"/);
});
test("transactional reserved-seat and ticket email implementations never consult mailing-list status", async () => {
  const paths=["email/send-reserved-seat-link-email.ts","email/reserved-seat-email.ts","email/official-ticket-email.ts"];
  for(const path of paths){const source=await readFile(new URL(path,import.meta.url),"utf8");assert.doesNotMatch(source,/mailing_list_subscribers|unsubscribed_at/);}
});

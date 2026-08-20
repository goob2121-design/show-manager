import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../app/components/email-center.tsx", import.meta.url);
const individualPath = new URL("../app/api/admin/email-center/route.ts", import.meta.url);
const bulkPath = new URL("../app/api/admin/email-center/bulk/route.ts", import.meta.url);

test("ticket discount template exposes saved codes while manual promo fields remain editable", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /templateKey === "ticket_discount" \? <SavedDiscountCodes/);
  assert.match(source, /promo_code: selection\.code/);
  assert.match(source, /promo_offer: selection\.offerText/);
  assert.match(source, /ticket_link: selection\.ticketUrl/);
  assert.match(source, /promo_code: event\.target\.value/);
  assert.match(source, /promo_offer: event\.target\.value/);
  assert.match(source, /changeTicketPurchaseUrl\(event\.target\.value\)/);
});

test("saved code selection continues through existing individual and personalized bulk renderers", async () => {
  const individual = await readFile(individualPath, "utf8");
  const bulk = await readFile(bulkPath, "utf8");
  assert.match(individual, /message_text: renderedEmail\.text/);
  assert.match(individual, /promoOffer: resolvedPromoOffer\.rendered, promoCode: resolvedPromoCode\.rendered/);
  assert.match(bulk, /campaignMergeFields/);
  assert.match(bulk, /selected\.map\(\(recipient\)/);
  assert.match(bulk, /message_text: item\.renderedEmail\.text/);
  assert.doesNotMatch(individual, /email_discount_codes/);
  assert.doesNotMatch(bulk, /email_discount_codes/);
});

test("sent history remains an immutable rendered snapshot independent of saved-code edits", async () => {
  const individual = await readFile(individualPath, "utf8");
  assert.match(individual, /subject: resolvedSubject\.rendered/);
  assert.match(individual, /message_text: renderedEmail\.text/);
  assert.match(individual, /html: renderedEmail\.html/);
});

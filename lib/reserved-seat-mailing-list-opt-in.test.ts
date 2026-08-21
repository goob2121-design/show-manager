import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const selectionPage = new URL("../app/components/reserved-seat-selection-page.tsx", import.meta.url);
const submitRoute = new URL("../app/api/reserved-seating/submit/route.ts", import.meta.url);
const preferenceRoute = new URL("../app/api/reserved-seating/preference/route.ts", import.meta.url);
const subscriptionHelper = new URL("./mailing-list-subscription.ts", import.meta.url);

test("reserved-seat and choose-for-me flows expose the same unchecked opt-in", async () => {
  const source = await readFile(selectionPage, "utf8");
  assert.match(source, /mailingListOptIn[\s\S]*useState\(false\)/);
  assert.equal(source.match(/Keep me updated about upcoming Cumberland Mountain Music Shows, special announcements, and exclusive discounts\./g)?.length, 2);
  assert.match(source, /saveSeatPreference\("auto_assign"\)[\s\S]*Choose My Seats for Me/);
  assert.match(source, /Confirm Reserved Seats[\s\S]*checked=\{mailingListOptIn\}[\s\S]*Yes, Reserve These Seats/);
});

test("browser submits only consent while the server derives identity from the reservation token", async () => {
  const [page, submit, preference] = await Promise.all([
    readFile(selectionPage, "utf8"),
    readFile(submitRoute, "utf8"),
    readFile(preferenceRoute, "utf8"),
  ]);
  assert.match(page, /token: seatingLink\.selection_token[\s\S]*mailingListOptIn/);
  assert.doesNotMatch(page, /mailingListOptIn[\s\S]{0,200}email:/);
  assert.match(submit, /email: typedSeatingLink\.email/);
  assert.match(preference, /\.select\("id,submitted_at,email,customer_name"\)[\s\S]*email: link\.email/);
});

test("mailing-list work occurs only after successful seat or NSS persistence and is failure-isolated", async () => {
  const [submit, preference] = await Promise.all([readFile(submitRoute, "utf8"), readFile(preferenceRoute, "utf8")]);
  assert.ok(submit.indexOf("update({ submitted_at:") < submit.lastIndexOf("subscribeMailingListContact"));
  assert.ok(preference.indexOf("update({ seat_preference: preference })") < preference.lastIndexOf("subscribeMailingListContact"));
  assert.match(submit, /subscribeMailingListContact[\s\S]*catch \(error\)[\s\S]*Automatic official ticket email/);
  assert.match(preference, /subscribeMailingListContact[\s\S]*catch \(error\)[\s\S]*return NextResponse\.json\(\{ success: true/);
});

test("shared subscription behavior prevents duplicates and records ticket consent", async () => {
  const [helper, submit, preference] = await Promise.all([
    readFile(subscriptionHelper, "utf8"),
    readFile(submitRoute, "utf8"),
    readFile(preferenceRoute, "utf8"),
  ]);
  assert.match(helper, /existing\.status === "active" \? "already_subscribed"/);
  assert.match(helper, /error\?\.code === "23505"/);
  assert.match(submit, /source: "ticket_opt_in"/);
  assert.match(preference, /source: "ticket_opt_in"/);
  assert.match(helper, /confirmResubscribe/);
});

test("reservation names are split without requiring new customer input", async () => {
  const helper = await readFile(subscriptionHelper, "utf8");
  assert.match(helper, /splitMailingListFullName/);
  assert.match(helper, /trim\(\)\.split\(\/\\s\+\/\)\.filter\(Boolean\)/);
  assert.match(helper, /firstName: parts\[0\]/);
  assert.match(helper, /lastName: parts\.slice\(1\)\.join\(" "\)/);
});

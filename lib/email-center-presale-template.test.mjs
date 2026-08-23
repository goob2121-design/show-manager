import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EMAIL_CENTER_MERGE_FIELDS, resolveEmailCenterMergeFields } from "./email-center.ts";
import { formatEmailCenterSaleDate, validatePresaleEmailFields, withPresaleGreetingFallback } from "./email-center-presale.ts";
import { getManualEmailTemplate } from "./manual-email-center.ts";
import { EMAIL_CENTER_LOGO_URL, renderEmailCenterEmail } from "./email-center-renderer.ts";

test("presale merge fields render selected show data and friendly Eastern dates", () => {
  for (const field of ["presale_start", "public_sale_start"]) assert.ok(EMAIL_CENTER_MERGE_FIELDS.includes(field));
  assert.equal(formatEmailCenterSaleDate("2026-09-01T20:00:00-04:00"), "September 1 at 8:00 PM");
  const template = getManualEmailTemplate("presale_early_access");
  assert.equal(template?.subject, "Your CMMS Early Access Ticket Link");
  const fields = withPresaleGreetingFallback({
    first_name: "Bryan", show_name: "Cumberland Mountain Music Show", show_date: "October 3, 2026",
    presale_start: "September 1 at 8:00 PM", public_sale_start: "September 8 at 8:00 PM",
    ticket_link: "https://tickets.example.com/october",
  });
  const message = resolveEmailCenterMergeFields(template?.message ?? "", fields);
  const cta = resolveEmailCenterMergeFields(template?.ctaUrl ?? "", fields);
  assert.equal(message.unresolved.length, 0);
  assert.match(message.rendered, /^Hi Bryan,/);
  assert.match(message.rendered, /Cumberland Mountain Music Show on October 3, 2026/);
  assert.match(message.rendered, /September 1 at 8:00 PM/);
  assert.match(message.rendered, /September 8 at 8:00 PM/);
  assert.equal(cta.rendered, "https://tickets.example.com/october");
  assert.equal(template?.ctaLabel, "EARLY ACCESS TICKETS");
  assert.match(message.rendered, /Gmail users: If you don't see our email in your Primary inbox, please check Promotions\. You may also want to check Spam or Social\./);
  const branded = renderEmailCenterEmail({
    heading: template?.heading, message: message.rendered, ctaLabel: template?.ctaLabel,
    ctaUrl: cta.rendered, unsubscribeUrl: "https://example.com/unsubscribe",
  });
  assert.match(branded.html, /#071426/);
  assert.match(branded.html, new RegExp(EMAIL_CENTER_LOGO_URL.replace(/[.]/g, "\\.")));
  assert.match(branded.html, /Big-Time Show &bull; Small-Town Hospitality/);
  assert.match(branded.html, /www\.cumberlandmountainmusic\.com/);
  assert.match(branded.html, /Unsubscribe from CMMS updates/);
});
test("presale greeting safely falls back without changing legacy recipient values", () => {
  const named = withPresaleGreetingFallback({ first_name: "Bryan" });
  const unnamed = withPresaleGreetingFallback({ first_name: "", full_name: "" });
  const legacyUnnamed = { first_name: "Friend", full_name: "CMMS Friend" };
  assert.equal(resolveEmailCenterMergeFields("Hi {{first_name}},", named).rendered, "Hi Bryan,");
  const rendered = resolveEmailCenterMergeFields("Hi {{first_name}},", withPresaleGreetingFallback(legacyUnnamed)).rendered;
  assert.equal(rendered, "Hi there,");
  assert.equal(resolveEmailCenterMergeFields("Hi {{first_name}},", unnamed).rendered, "Hi there,");
  assert.doesNotMatch(rendered, /Hi\s*,|undefined|null/);
  assert.deepEqual(legacyUnnamed, { first_name: "Friend", full_name: "CMMS Friend" });
});


test("presale validation blocks missing or unsafe show delivery data", () => {
  assert.deepEqual(validatePresaleEmailFields({}), [
    "The selected show is unavailable.",
    "The selected show's date is missing.",
    "The selected show's presale start date is missing.",
    "The selected show's public sale start date is missing.",
    "This show does not have a valid ticket link in Show Details.",
  ]);
  assert.deepEqual(validatePresaleEmailFields({ show_name: "CMMS", show_date: "October 3, 2026", presale_start: "September 1", public_sale_start: "September 8", ticket_link: "http://unsafe.example" }), ["This show does not have a valid ticket link in Show Details."]);
});

test("presale show fields are server-authoritative and status mismatch is visible", async () => {
  const [singleRoute, bulkRoute, component] = await Promise.all([
    readFile(new URL("../app/api/admin/email-center/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/email-center/bulk/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/email-center.tsx", import.meta.url), "utf8"),
  ]);
  for (const field of ["ticket_sale_status", "presale_starts_at", "public_sale_starts_at", "ticket_link"]) assert.match(singleRoute, new RegExp(field));
  assert.match(singleRoute, /withPresaleGreetingFallback\(\{ \.\.\.clientMergeFields, \.\.\.emailCenterShowMergeFields\(access\.show\) \}\)/);
  assert.match(bulkRoute, /templateFields = templateKey === PRESALE_EMAIL_TEMPLATE_KEY \? presaleShowFields/);
  assert.match(singleRoute, /getEffectiveTicketSaleState\(access\.show\)/);
  assert.match(component, /Presale is scheduled but has not started yet\./);
  assert.match(component, /Presale has ended; this show is now in Public Sale\./);
  assert.match(component, /Ticket sales are currently disabled by the manual Not On Sale override\./);
  assert.match(singleRoute, /ctaUrlTemplate = templateKey === PRESALE_EMAIL_TEMPLATE_KEY \? "\{\{ticket_link\}\}" : stringValue\(body\.ctaUrl\)/);
  assert.match(bulkRoute, /ctaUrlTemplate = templateKey === PRESALE_EMAIL_TEMPLATE_KEY \? "\{\{ticket_link\}\}" : text\(body\.ctaUrl\)/);
  assert.match(component, /CTA URL from Show Details/);
  assert.match(component, /value=\{effectiveMergeFields\.ticket_link \?\? ""\} readOnly/);
  assert.match(component, /Uses the selected show's authoritative ticket link\. Update it in Show Details\./);
  assert.match(component, /usesPresaleTemplate \? <label[\s\S]*: <label className="grid gap-2 text-sm font-semibold">CTA URL \(optional\)/);
  assert.match(component, /effectiveTicketSaleStatus === "presale" \? null/);
  assert.match(component, /Presale show data/);
});

test("forward-only constraint keeps existing template keys and adds presale", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260822_allow_email_center_presale_early_access_template.sql", import.meta.url), "utf8");
  for (const key of ["general", "complimentary_tickets", "reserved_seating", "sponsor_message", "show_information", "custom", "ticket_discount", "presale_early_access"]) assert.match(sql, new RegExp(`'${key}'`));
  assert.match(sql, /drop constraint if exists manual_email_history_template_key_check/);
});

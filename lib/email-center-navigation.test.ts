import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../app/components/email-center.tsx", import.meta.url);
const routePath = new URL("../app/api/admin/email-center/route.ts", import.meta.url);

test("Email Center defaults to Compose and exposes responsive hash navigation", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /useState<EmailCenterSection>\("compose"\)/);
  for (const label of ["Compose", "Templates", "Discount Codes", "Sent & Activity"]) assert.match(source, new RegExp(`label: "${label}"`));
  assert.match(source, /window\.location\.hash\.slice\(1\)/);
  assert.match(source, /#\$\{section\}/);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /min-w-max/);
});

test("section switching preserves parent compose state and existing send controls", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /activeSection === "compose" \? <section/);
  assert.match(source, /value=\{subject\}/);
  assert.match(source, /value=\{message\}/);
  assert.match(source, /onSubmit=\{\(event\) => void handleSubmit\(event\)\}/);
  assert.match(source, /disabled=\{isSending \|\| \(audienceKey \? !selectedReadyRows\.length : !ready\)\}/);
  assert.doesNotMatch(source, /isPastShow[^\n]*disabled/);
});

test("Templates and Discount Codes reuse existing functionality", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /activeSection === "templates"/);
  assert.match(source, /manualEmailTemplates\.map/);
  assert.match(source, /handleTemplateChange\(template\.key\)/);
  assert.match(source, /activeSection === "discount-codes"/);
  assert.match(source, /<SavedDiscountCodes slug=\{slug\} onSelect=\{selectSavedDiscountCode\}/);
});

test("Sent & Activity contains existing campaign and immutable delivery history", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /activeSection === "sent"/);
  for (const label of ["Bulk Sends / Campaigns", "Recent Emails", "Message Details", "Email Activity", "Resend ID:"]) assert.match(source, new RegExp(label));
  assert.match(source, /item\.message/);
  assert.match(source, /item\.events\.map/);
});

test("show banner identifies current and past shows without blocking sending", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /showContext\.name/);
  assert.match(source, /formatShowDate\(showContext\.showDate\)/);
  assert.match(source, /PAST SHOW/);
  assert.match(source, /CURRENT \/ UPCOMING SHOW/);
  assert.match(source, /Messages sent here will be recorded under this show/);
  assert.doesNotMatch(source, /isPastShow\s*\?[^\n]*disabled/);
});

test("current-show shortcut reuses Dashboard selection and never links to itself", async () => {
  const component = await readFile(componentPath, "utf8");
  const route = await readFile(routePath, "utf8");
  assert.match(route, /\.eq\("is_archived", false\)\.gte\("show_date", today\)/);
  assert.match(route, /\.order\("show_date", \{ ascending: true \}\)\.limit\(1\)/);
  assert.match(component, /currentUpcomingShow\.slug !== showContext\?\.slug/);
  assert.match(component, /`\/admin\/\$\{encodeURIComponent\(currentShowLink\.slug\)\}\/email-center`/);
});

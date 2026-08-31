import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("./email-center.tsx", import.meta.url);

test("Email Center supports known-recipient search and editable manual recipients", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /mode=recipients/);
  assert.match(source, /Search name or email/);
  assert.match(source, /recipient\.name.*recipient\.email/);
  assert.match(source, /function selectRecipient/);
  assert.match(source, /type="email" required=\{!usesAudienceRecipients\} disabled=\{usesAudienceRecipients\} value=\{recipientEmail\}/);
  assert.match(source, /function changeRecipientEmail/);
});

test("Email Center previews resolved content, validates, confirms, and prevents repeat clicks", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /resolveEmailCenterMergeFields\(subject, effectiveMergeFields\)/);
  assert.match(source, /findUnresolvedEmailCenterMergeFields/);
  assert.match(source, /Ready to Send/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /To: \$\{recipientName/);
  assert.match(source, /From: \$\{selectedSender\.from\}/);
  assert.match(source, /if \(isSending \|\| !ready/);
  assert.match(source, /disabled=\{isSending \|\| \(usesAudienceRecipients \? !selectedReadyRows\.length : !ready\)\}/);
  assert.match(source, /crypto\.randomUUID\(\)/);
});

test("Email Center history exposes filters, status, immutable details, and activity", async () => {
  const source = await readFile(componentPath, "utf8");
  for (const label of ["Recent Emails", "Message Details", "Email Activity", "Reply-To:", "Resend ID:"]) assert.match(source, new RegExp(label));
  for (const filter of ["all","sent","delivered","opened","clicked","problems"]) assert.match(source, new RegExp(`["']${filter}["']`));
  assert.match(source, /item\.message/);
  assert.match(source, /item\.events\.map/);
  assert.match(source, /event\.clickedUrl/);
  assert.doesNotMatch(source, /RESEND_API_KEY|SUPABASE_SERVICE_ROLE/);
  assert.match(source, /href="https:\/\/webmail\.porkbun\.com/);
});

test("Email Center preview uses the canonical branded renderer with optional heading and CTA fields", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /renderEmailCenterEmail/);
  assert.match(source, /srcDoc=\{renderedEmail\.html\}/);
  for (const label of ["Email Heading", "CTA Button Label", "CTA URL"]) assert.match(source, new RegExp(label));
  assert.match(source, /heading, ctaLabel, ctaUrl/);
});

test("Email Center exposes reusable editable ticket-promotion fields", async () => {
  const source = await readFile(componentPath, "utf8");
  for (const label of ["Discount / Promo Code", "Offer Text", "Ticket Purchase URL"]) assert.match(source, new RegExp(label));
  assert.match(source, /campaignMergeFields/);
});

test("Ticket Purchase URL automatically configures the gold ticket CTA", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /function changeTicketPurchaseUrl/);
  assert.match(source, /setCtaUrl\(value\)/);
  assert.match(source, /current\.trim\(\) \|\| "Get Tickets"/);
  assert.match(source, /onChange=\{\(event\) => changeTicketPurchaseUrl\(event\.target\.value\)\}/);
});

test("Email Center keeps compact show context and actions inside the responsive header", async () => {
  const source = await readFile(componentPath, "utf8");
  const headerStart = source.indexOf('<header aria-label="Email Center header"');
  const headerEnd = source.indexOf("</header>", headerStart);
  const header = source.slice(headerStart, headerEnd);
  const navigationStart = source.indexOf('<nav aria-label="Email Center sections"');

  assert.ok(headerStart >= 0);
  assert.ok(navigationStart > headerEnd);
  assert.match(header, /aria-label="Current show context"/);
  assert.match(header, /\{showContext\.name\}/);
  assert.match(header, /formatShowDate\(showContext\.showDate\)/);
  assert.match(header, /isPastShow \? "Past Show" : "Current Show"/);
  assert.match(header, /You are viewing the Email Center for a past show/);
  assert.match(header, /Go to Current Show Email Center/);
  assert.match(header, /Mailing List/);
  assert.match(header, /Open Webmail/);
  assert.match(header, /Back to Admin/);
  assert.match(header, /flex-col[^"]*md:flex-row/);
  assert.doesNotMatch(source, /CURRENT \/ UPCOMING SHOW/);
  assert.equal((source.match(/aria-label="Current show context"/g) ?? []).length, 1);
  for (const section of ["Compose", "Templates", "Discount Codes", "Sent & Activity"]) {
    assert.match(source, new RegExp(`label: "${section}"`));
  }
});

test("Composer separates sender/search and recipient details into responsive rows", async () => {
  const source = await readFile(componentPath, "utf8");
  const fieldsStart = source.indexOf('aria-label="Sender and recipient fields"');
  const fieldsEnd = source.indexOf("Template", fieldsStart);
  const fields = source.slice(fieldsStart, fieldsEnd);

  assert.ok(fieldsStart >= 0);
  assert.match(fields, /className="grid gap-6"/);
  assert.equal((fields.match(/className="grid gap-5 md:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]"/g) ?? []).length, 2);
  assert.match(fields, /From/);
  assert.match(fields, /Find show recipient/);
  assert.match(fields, /Recipient name/);
  assert.match(fields, />To\s*</);
  assert.match(fields, /grid min-w-0 gap-2 text-sm font-semibold">From/);
  assert.match(fields, /w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-xl/);
  assert.match(fields, /id="recipient-search"[\s\S]*?className="w-full min-w-0/);
  assert.match(fields, /function selectRecipient|selectRecipient\(recipient\)/);
});

test("Mailing List bulk preview cycles real deduplicated recipients through the shared delivery renderer", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /renderEmailCenterRecipientEmail/);
  assert.match(source, /Previewing \{boundedPreviewIndex \+ 1\} of \{previewRows\.length\} recipients/);
  assert.match(source, /previewRow\.recipient\.name/);
  assert.match(source, /previewRow\.recipient\.email/);
  assert.match(source, />Previous</);
  assert.match(source, />Next</);
  assert.match(source, /srcDoc=\{previewRow\.renderedEmail\.html\}/);
  assert.match(source, /Mailing List · \{readyAudienceRows\.length\} recipient/);
  assert.match(source, /setAudienceKey\(value\);[\s\S]*setPreviewRecipientIndex\(0\);[\s\S]*if \(!value\)/);
  assert.match(source, /cannot be rendered and will not be sent broken content/);

});
test("dynamic audiences bypass manual To validation while preserving manual and empty-audience safeguards", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /const usesAudienceRecipients = Boolean\(audienceKey\)/);
  assert.match(source, /required=\{!usesAudienceRecipients\}/);
  assert.match(source, /disabled=\{usesAudienceRecipients\}/);
  assert.match(source, /ok: usesAudienceRecipients \|\| isValidManualEmailAddress\(recipientEmail\)/);
  assert.match(source, /if \(usesAudienceRecipients\) \{[\s\S]*await handleBulkSubmit\(\)/);
  assert.match(source, /usesAudienceRecipients \? !selectedReadyRows\.length : !ready/);
  assert.match(source, /const ready = checks\.every/);
  assert.match(source, /isValidManualEmailAddress\(recipientEmail\)/);
  assert.match(source, /srcDoc=\{previewRow\.renderedEmail\.html\}/);
});

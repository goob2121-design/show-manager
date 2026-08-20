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
  assert.match(source, /type="email" required value=\{recipientEmail\}/);
  assert.match(source, /function changeRecipientEmail/);
});

test("Email Center previews resolved content, validates, confirms, and prevents repeat clicks", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /resolveEmailCenterMergeFields\(subject, mergeFields\)/);
  assert.match(source, /findUnresolvedEmailCenterMergeFields/);
  assert.match(source, /Ready to Send/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /To: \$\{recipientName/);
  assert.match(source, /From: \$\{selectedSender\.from\}/);
  assert.match(source, /if \(isSending \|\| !ready/);
  assert.match(source, /disabled=\{isSending \|\| \(audienceKey \? !selectedReadyRows\.length : !ready\)\}/);
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

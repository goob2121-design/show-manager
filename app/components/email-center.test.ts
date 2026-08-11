import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("./email-center.tsx", import.meta.url);

test("Email Center composer exposes editable fields and does not send on template selection", async () => {
  const source = await readFile(componentPath, "utf8");
  const templateHandler = source.slice(
    source.indexOf("function handleTemplateChange"),
    source.indexOf("async function handleSubmit"),
  );
  assert.match(source, /value=\{senderKey\}/);
  assert.match(source, /type="email"[\s\S]*value=\{recipientEmail\}/);
  assert.match(source, /value=\{templateKey\}/);
  assert.match(source, /value=\{subject\}/);
  assert.match(source, /<textarea[\s\S]*value=\{message\}/);
  assert.match(templateHandler, /setSubject\(template\.subject\)/);
  assert.match(templateHandler, /setMessage\(template\.message\)/);
  assert.doesNotMatch(templateHandler, /fetch\(|handleSubmit|emails\.send/);
});

test("Email Center prevents repeat clicks and displays complete recent history", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /if \(isSending\) return/);
  assert.match(source, /disabled=\{isSending\}/);
  assert.match(source, /\{isSending \? "Sending\.\.\." : "Send Email"\}/);
  assert.match(source, /Recent Sent Emails/);
  for (const label of ["Date / Time", "Recipient", "From", "Subject", "Template", "Status", "Resend ID"]) {
    assert.match(source, new RegExp(label.replace("/", "\\/")));
  }
  assert.match(source, /href="https:\/\/webmail\.porkbun\.com\/\?_task=mail&_mbox=INBOX"/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.doesNotMatch(source, /RESEND_API_KEY|SUPABASE_SERVICE_ROLE/);
});

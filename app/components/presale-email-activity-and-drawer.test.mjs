import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const emailApiUrl = new URL("../api/admin/email-center/route.ts", import.meta.url);
const emailUiUrl = new URL("./email-center.tsx", import.meta.url);
const mailingUiUrl = new URL("./mailing-list-admin.tsx", import.meta.url);

test("Email Center combines automatic signup and resend activity without scheduled or legacy originals", async () => {
  const source = await readFile(emailApiUrl, "utf8");
  assert.match(source, /delivery\.delivery_source === "automatic_signup"/);
  assert.doesNotMatch(source, /delivery\.delivery_source === "scheduled_campaign" \? \[publicPresaleActivity/);
  assert.match(source, /activityType: "automatic_presale"/);
  assert.match(source, /activityType: "presale_resend"/);
  assert.match(source, /\[\.\.\.manual, \.\.\.presaleActivity\][\s\S]*sort[\s\S]*slice\(0, 50\)/);
});

test("Recent Emails labels activity, preserves filters, and searches recipient subject and type", async () => {
  const source = await readFile(emailUiUrl, "utf8");
  assert.match(source, /Automatic Presale Access|item\.displayType/);
  assert.match(source, /Presale Access Resend|item\.displayType/);
  assert.match(source, /historySearch/);
  assert.match(source, /item\.recipientName[\s\S]*item\.recipientEmail[\s\S]*item\.subject[\s\S]*item\.displayType/);
  assert.match(source, /"all","sent","delivered","opened","clicked","problems"/);
  assert.match(source, /Automatic presale body snapshot was not stored/);
});

test("Mailing List uses an explicit View action and preserves existing row actions", async () => {
  const source = await readFile(mailingUiUrl, "utf8");
  assert.match(source, />View<\/button>/);
  assert.match(source, />Edit<\/button>/);
  assert.match(source, /Unsubscribe.*Reactivate/);
  assert.match(source, /role="dialog" aria-modal="true"/);
  assert.match(source, /Presale Access History/);
  assert.match(source, /Legacy \/ unknown source/);
  assert.match(source, /Presale Access Resend/);
});

test("drawer confirmation shows authoritative context and guards overlapping clicks", async () => {
  const source = await readFile(mailingUiUrl, "utf8");
  assert.match(source, /window\.confirm/);
  assert.match(source, /Current status: Presale/);
  assert.match(source, /Ticket destination:/);
  assert.match(source, /resendInFlight\.current/);
  assert.match(source, /requestId: crypto\.randomUUID\(\)/);
  assert.match(source, /Customer reported email missing/);
});

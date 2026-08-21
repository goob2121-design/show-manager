import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../app/components/email-center.tsx", import.meta.url);

test("ticket promotion panel uses the stable ticket_discount template key", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /const usesTicketPromotion = templateKey === "ticket_discount"/);
  assert.match(source, /\{usesTicketPromotion \? <section[^\n]*Ticket Promotion Details/);
  assert.doesNotMatch(source, /template\.label.*Save on Tickets/);
});

test("promotion validation only participates for the promotional template", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /\.\.\.\(usesTicketPromotion \? \[\{ label: "Promotion"/);
  assert.match(source, /:\s*\[\]\),/);
  assert.match(source, /const ready = checks\.every/);
});

test("switching templates preserves current promo compose values", async () => {
  const source = await readFile(componentPath, "utf8");
  const start = source.indexOf("function handleTemplateChange");
  const end = source.indexOf("async function handleSubmit", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.doesNotMatch(handler, /setMergeFields|promo_code|promo_offer|ticket_link/);
  assert.match(source, /value=\{mergeFields\.promo_code \?\? ""\}/);
  assert.match(source, /value=\{mergeFields\.promo_offer \?\? ""\}/);
});

test("Compose uses responsive Composer and sticky Preview and validation regions", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /aria-label="Composer"/);
  assert.match(source, /aria-label="Preview and validation"/);
  assert.match(source, /xl:grid-cols-\[minmax\(0,1\.2fr\)_minmax\(360px,0\.8fr\)\]/);
  assert.match(source, /xl:sticky xl:top-6/);
  assert.match(source, /className="grid items-start gap-6 xl:grid-cols/);
});

test("existing preview renderer and send controls remain unchanged", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /srcDoc=\{renderedEmail\.html\}/);
  assert.match(source, /checks\.map/);
  assert.match(source, /onSubmit=\{\(event\) => void handleSubmit\(event\)\}/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /disabled=\{isSending \|\| \(audienceKey \? !selectedReadyRows\.length : !ready\)\}/);
});

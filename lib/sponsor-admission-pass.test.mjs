import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const helperSource = await readFile(new URL("./sponsor-admission-pass.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/admin/[slug]/print/sponsor-admission-pass/page.tsx", import.meta.url), "utf8");
const panelSource = await readFile(new URL("../app/components/tickets/sponsor-comp-panel.tsx", import.meta.url), "utf8");
const builderSource = await readFile(new URL("../app/components/tickets/ticket-print-builders.ts", import.meta.url), "utf8");

test("admission passes use canonical complimentary reservations and structured seats", () => {
  assert.match(helperSource, /if \(!link\.is_complimentary\) continue/);
  assert.match(helperSource, /link\.source_show_sponsor_id/);
  assert.match(helperSource, /link\.source_ticket_id/);
  assert.match(helperSource, /link\.scan_token/);
  assert.match(helperSource, /assignment\.seating_link_id/);
  assert.match(helperSource, /link\.submitted_at \? "nss" : "pending"/);
});

test("print route reuses the canonical ticket code and prints one Letter page per pass", () => {
  assert.match(pageSource, /ReservationTicketCode scanToken=\{pass\.scanToken\}/);
  assert.match(pageSource, /@page \{ size: letter portrait/);
  assert.match(pageSource, /break-after: page/);
  assert.match(pageSource, /One scan admits all/);
  assert.doesNotMatch(pageSource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("Sponsor and Comp rows expose only ready canonical admission passes", () => {
  assert.match(builderSource, /source_show_sponsor_id === sponsor\.id/);
  assert.match(builderSource, /source_ticket_id === item\.id/);
  assert.match(builderSource, /Boolean\(link\.scan_token\?\.trim\(\)\) && link\.ticket_count > 0/);
  assert.match(panelSource, />\s*Print Admission Pass\s*</);
  assert.match(panelSource, /Print Sponsor Packet Passes/);
  assert.match(panelSource, /row\.admissionPassReady/);
});

test("seat labels are numeric and do not imply a false contiguous range", () => {
  assert.match(helperSource, /seat\.seat_number\)\.join\(", "\)/);
  assert.doesNotMatch(helperSource, /seat\.seat_number\)\.join\("–"\)/);
});

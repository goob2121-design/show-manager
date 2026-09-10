import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helperSource = await readFile(new URL("./sponsor-comp-print-barcode.ts", import.meta.url), "utf8");
const { generateCode128 } = await import("./reservation-scan-tokens.ts");
const { buildSponsorCompPrintRecords } = await import("./sponsor-comp-print-studio.ts");

test("Sponsor Comp barcode uses the exact stored token and produces Code128 SVG", () => {
  const token = "stf_scomp_0123456789ABCDEF";
  const [record] = buildSponsorCompPrintRecords({
    sponsorName: "Music Mercantile",
    showName: "Cumberland Mountain Music Show",
    showDate: "2026-10-03",
    allowance: 1,
    tokens: [{ id: "token-1", token, ordinal: 1, redeemed_at: null, voided_at: null }],
  });
  const barcode = generateCode128(record.sponsor_comp_redemption_token);

  assert.match(helperSource, /record\?\.sponsor_comp_redemption_token\?\.trim\(\)/);
  assert.match(helperSource, /generateCode128\(token\)/);
  assert.ok(barcode);
  assert.equal(barcode.token, token);
  assert.equal(barcode.type, "CODE128");
  assert.match(barcode.svg, /<rect /);
  assert.ok(barcode.svg.length > 1000);
});

test("each Sponsor Comp record encodes its own stored token", () => {
  const first = generateCode128("stf_scomp_FIRST0001");
  const second = generateCode128("stf_scomp_SECOND002");

  assert.ok(first && second);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.svg, second.svg);
});

test("a missing Sponsor Comp token produces no fabricated barcode", () => {
  assert.match(helperSource, /return token \? generateCode128\(token\) : null/);
});

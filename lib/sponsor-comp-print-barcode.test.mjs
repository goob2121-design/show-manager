import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helperSource = await readFile(new URL("./sponsor-comp-print-barcode.ts", import.meta.url), "utf8");
const { generateCode128 } = await import("./reservation-scan-tokens.ts");
const { buildSponsorCompPrintRecords } = await import("./sponsor-comp-print-studio.ts");

function renderSponsorCompBarcode(token) {
  const barcode = generateCode128(token);
  return {
    ...barcode,
    svg: barcode.svg.replace(
      "<svg ",
      '<svg width="100%" height="100%" preserveAspectRatio="none" ',
    ),
  };
}

test("Sponsor Comp barcode uses the exact stored token and produces Code128 SVG", () => {
  const token = "stf_scomp_0123456789ABCDEF";
  const [record] = buildSponsorCompPrintRecords({
    sponsorName: "Music Mercantile",
    showName: "Cumberland Mountain Music Show",
    showDate: "2026-10-03",
    allowance: 1,
    tokens: [{ id: "token-1", token, ordinal: 1, redeemed_at: null, voided_at: null }],
  });
  const barcode = renderSponsorCompBarcode(record.sponsor_comp_redemption_token);

  assert.match(helperSource, /record\?\.sponsor_comp_redemption_token\?\.trim\(\)/);
  assert.match(helperSource, /generateCode128\(token\)/);
  assert.ok(barcode);
  assert.equal(barcode.token, token);
  assert.equal(barcode.type, "CODE128");
  assert.match(barcode.svg, /<svg width="100%" height="100%" preserveAspectRatio="none" /);
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
  assert.match(helperSource, /if \(!token\) return null/);
});

test("responsive inline SVG lets the bars follow practical field width and height", () => {
  const barcode = renderSponsorCompBarcode("stf_scomp_0123456789ABCDEF");

  assert.match(helperSource, /width="100%" height="100%" preserveAspectRatio="none"/);
  assert.match(barcode.svg, /preserveAspectRatio="none"/);
  assert.doesNotMatch(barcode.svg, /data:image\/svg\+xml/);

  const viewBox = barcode.svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const bar = barcode.svg.match(/<rect x="[\d.]+" y="0" width="[\d.]+" height="([\d.]+)" fill="#111111"/);
  assert.ok(viewBox && bar);
  assert.equal(Number(bar[1]), Number(viewBox[2]));

  const dimensions = [
    { name: "wide and short", width: 80, height: 22 },
    { name: "wide and tall", width: 80, height: 45 },
    { name: "narrower and tall", width: 53.25, height: 45 },
    { name: "minimum", width: 42, height: 22 },
  ];

  for (const field of dimensions) {
    // With a full-height viewBox and preserveAspectRatio="none", bar height equals the field height.
    const renderedBarHeight = (Number(bar[1]) / Number(viewBox[2])) * field.height;
    assert.equal(renderedBarHeight, field.height, field.name);
    assert.ok(field.width >= 42 && field.height >= 22, field.name);
  }
});

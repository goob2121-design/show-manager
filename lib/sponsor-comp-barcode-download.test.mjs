import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sponsorCompBarcodeFilename } from "./sponsor-comp-barcode-download.ts";
import { generateCode128 } from "./reservation-scan-tokens.ts";

const routeUrl = new URL("../app/api/admin/shows/[showId]/sponsor-comp-redemption-tokens/[tokenId]/barcode/route.ts", import.meta.url);
const managerUrl = new URL("../app/components/tickets/sponsor-comp-redemption-token-manager.tsx", import.meta.url);
const listRouteUrl = new URL("../app/api/admin/shows/[showId]/sponsor-comp-redemption-tokens/route.ts", import.meta.url);

test("download uses the canonical Code 128 renderer and returns PNG", async () => {
  const route = await readFile(routeUrl, "utf8");
  assert.match(route, /generateCode128\(tokenRow\.token\)/);
  assert.match(route, /sharp\(Buffer\.from\(barcode\.svg\)\)/);
  assert.match(route, /"content-type": "image\/png"/);
  assert.doesNotMatch(route, /generateSponsorCompRedemptionToken/);
  assert.doesNotMatch(route, /\.rpc\(/);
});

test("download is authenticated, record-addressed, show/sponsor scoped, and read-only", async () => {
  const route = await readFile(routeUrl, "utf8");
  assert.match(route, /verifyAdminSessionCookieValue/);
  assert.match(route, /\.eq\("id", tokenId\)\.eq\("show_id", showId\)\.eq\("show_sponsor_id", showSponsorId\)/);
  assert.match(route, /\.eq\("id", showSponsorId\)\.eq\("show_id", showId\)/);
  assert.doesNotMatch(route, /\.(insert|update|upsert|delete)\(/);
  assert.match(route, /private, no-store/);
});

test("manager previews the stored entry code and preserves redeemed and voided downloads", async () => {
  const [manager, listRoute] = await Promise.all([readFile(managerUrl, "utf8"), readFile(listRouteUrl, "utf8")]);
  assert.match(listRoute, /show_sponsor_id,token,ordinal,redeemed_at/);
  assert.match(manager, /Entry Code: \{token\.token\}/);
  assert.match(manager, /View Barcode/);
  assert.match(manager, /Download/);
  assert.match(manager, /token\.redeemed_at \? "Redeemed"/);
  assert.match(manager, /token\.voided_at \? "Voided"/);
  assert.doesNotMatch(manager, /generateCode128|generateSponsorCompRedemptionToken/);
});

test("the same stored sponsor token produces the same canonical Code 128 barcode", () => {
  const token = "stf_scomp_0123456789ABCDEF";
  const first = generateCode128(token);
  const second = generateCode128(token);
  assert.equal(first.type, "CODE128");
  assert.equal(first.token, token);
  assert.equal(second.svg, first.svg);
});

test("download filenames are deterministic and safely sanitized", () => {
  assert.equal(sponsorCompBarcodeFilename("Music Mercantile", 1), "Music-Mercantile-Ticket-01.png");
  assert.equal(sponsorCompBarcodeFilename("Music / Mercantile!", 10), "Music-Mercantile-Ticket-10.png");
  assert.equal(sponsorCompBarcodeFilename("***", 0), "Sponsor-Ticket-01.png");
});

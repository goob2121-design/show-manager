import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { unzipSync, zipSync } from "fflate";
import { sponsorCompBarcodeFilename, sponsorCompBarcodeZipFilename } from "./sponsor-comp-barcode-download.ts";

const bulkRouteUrl = new URL("../app/api/admin/shows/[showId]/sponsor-comp-redemption-tokens/barcodes/route.ts", import.meta.url);
const individualRouteUrl = new URL("../app/api/admin/shows/[showId]/sponsor-comp-redemption-tokens/[tokenId]/barcode/route.ts", import.meta.url);
const managerUrl = new URL("../app/components/tickets/sponsor-comp-redemption-token-manager.tsx", import.meta.url);

test("bulk route is authenticated and scopes allocation and tokens to show and sponsor", async () => {
  const route = await readFile(bulkRouteUrl, "utf8");
  assert.match(route, /verifyAdminSessionCookieValue/);
  assert.match(route, /\.eq\("id", showId\)\.eq\("slug", slug\)/);
  assert.match(route, /\.eq\("id", showSponsorId\)\.eq\("show_id", showId\)/);
  assert.match(route, /\.eq\("show_id", showId\)\.eq\("show_sponsor_id", showSponsorId\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 404/);
});

test("bulk route renders every stored token in stable ordinal order including historical statuses", async () => {
  const route = await readFile(bulkRouteUrl, "utf8");
  assert.match(route, /token,ordinal,redeemed_at,voided_at/);
  assert.match(route, /\.order\("ordinal", \{ ascending: true \}\)/);
  assert.match(route, /for \(const tokenRow of tokenRows\)/);
  assert.match(route, /renderSponsorCompBarcodePng\(tokenRow\.token\)/);
  assert.match(route, /sponsorCompBarcodeFilename\(sponsorName, tokenRow\.ordinal\)/);
  assert.doesNotMatch(route, /\.filter\(/);
});

test("bulk route is read-only and cannot generate, redeem, or update attendance", async () => {
  const route = await readFile(bulkRouteUrl, "utf8");
  assert.doesNotMatch(route, /generateSponsorCompRedemptionToken|generate_sponsor_comp_redemption_tokens|redeem_sponsor_comp_redemption_token/);
  assert.doesNotMatch(route, /\.(insert|update|upsert|delete|rpc)\(/);
  assert.doesNotMatch(route, /checked_in|attendance/);
  assert.match(route, /private, no-store/);
});

test("ZIP filenames and entries are deterministic and preserve issued count", () => {
  const files = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
    sponsorCompBarcodeFilename("Music Mercantile", index + 1),
    new Uint8Array([index + 1]),
  ]));
  const archive = unzipSync(zipSync(files));
  assert.equal(sponsorCompBarcodeZipFilename("Music Mercantile"), "Music-Mercantile-Barcodes.zip");
  assert.deepEqual(Object.keys(archive), Array.from({ length: 10 }, (_, index) => `Music-Mercantile-Ticket-${String(index + 1).padStart(2, "0")}.png`));
  assert.equal(Object.keys(archive).length, 10);
});

test("manager exposes bulk download without changing individual download behavior", async () => {
  const [manager, individualRoute] = await Promise.all([readFile(managerUrl, "utf8"), readFile(individualRouteUrl, "utf8")]);
  assert.match(manager, /Download All \{tokens\.length\} Barcodes/);
  assert.match(manager, /sponsor-comp-redemption-tokens\/barcodes/);
  assert.match(manager, /href=\{barcodeUrl\(token\.id, true\)\}/);
  assert.match(individualRoute, /renderSponsorCompBarcodePng\(tokenRow\.token\)/);
  assert.doesNotMatch(individualRoute, /\.(insert|update|upsert|delete|rpc)\(/);
});

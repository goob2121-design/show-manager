import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const showPageUrl = new URL("show-page.tsx", import.meta.url);

test("printed payout sheet reuses a compact centered CMMS logo above its title", async () => {
  const source = await readFile(showPageUrl, "utf8");
  const payoutStart = source.indexOf("function buildPayoutSheetHtml");
  const payoutEnd = source.indexOf("function ", payoutStart + "function buildPayoutSheetHtml".length);
  const payoutSheet = source.slice(payoutStart, payoutEnd);

  assert.match(payoutSheet, /\.payout-logo \{[\s\S]*max-width: 230px;[\s\S]*max-height: 92px;[\s\S]*margin: 0 auto 0\.45rem;[\s\S]*object-fit: contain;/);
  assert.match(payoutSheet, /<img class="payout-logo" src="\/cmms-logo\.png" alt="Cumberland Mountain Music Show logo" \/>[\s\S]*<h1>Show Payout Sheet<\/h1>/);
  assert.equal((payoutSheet.match(/cmms-logo\.png/g) ?? []).length, 1);
});

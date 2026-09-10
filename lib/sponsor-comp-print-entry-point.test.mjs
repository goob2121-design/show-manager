import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Print Individual Tickets preserves the active show and sponsor allocation", async () => {
  const source = await readFile(new URL("../app/components/tickets/sponsor-comp-redemption-token-manager.tsx", import.meta.url), "utf8");
  assert.match(source, /source=sponsor-comp/);
  assert.match(source, /showId=\$\{encodeURIComponent\(showId\)\}/);
  assert.match(source, /slug=\$\{encodeURIComponent\(showSlug\)\}/);
  assert.match(source, /showSponsorId=\$\{encodeURIComponent\(showSponsorId\)\}/);
  assert.match(source, /tokens\.length > 0[\s\S]*Print Individual Tickets/);
  assert.doesNotMatch(source, /printTicketsHref[\s\S]*method:\s*["']POST/);
});

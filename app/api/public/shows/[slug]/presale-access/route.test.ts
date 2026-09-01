import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("./route.ts", import.meta.url);

test("public presale validation is server-side, throttled, and returns no configured code", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /validatePresaleAccess\(data, body\.code\)/);
  const helper = await readFile(new URL("../../../../../../lib/presale-access.ts", import.meta.url), "utf8");
  assert.match(helper, /effectiveTicketSaleStatus\(show, now\)/);
  assert.match(source, /limited\(`\$\{clientKey\}:\$\{slug\}`\)/);
  assert.match(source, /status: 429/);
  assert.match(source, /\.eq\("slug", slug\)/);
  assert.match(source, /return NextResponse\.json\(\{ valid: true, ticketUrl \}/);
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
  assert.doesNotMatch(source, /presale_access_code\s*[,}]/);
});

test("existing public sale-status response does not expose presale codes", async () => {
  const statusRoute = await readFile(new URL("../../../ticket-sales-status/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(statusRoute, /presale_access_code/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helper = new URL("./sponsor-comp-print-studio.ts", import.meta.url);

test("Sponsor Comp Print Studio maps existing tokens in stable ordinal order without writes", async () => {
  const source = await readFile(helper, "utf8");
  assert.match(source, /\.sort\(\(left, right\) => left\.ordinal - right\.ordinal\)/);
  assert.match(source, /Ticket \$\{token\.ordinal\} of \$\{total\}/);
  assert.match(source, /sponsor_comp_redemption_token: token\.token/);
  assert.doesNotMatch(source, /generateSponsorCompRedemptionToken|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

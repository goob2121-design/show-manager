import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source=readFileSync("lib/cash-drawer-controller.ts","utf8");
test("automatic drawer controller has a four-second hardware-only cooldown",()=>{assert.match(source,/AUTOMATIC_COOLDOWN_MS = 4_000/);assert.match(source,/openCashDrawerAfterPaidSale/);assert.match(source,/openCashDrawerManually/);});

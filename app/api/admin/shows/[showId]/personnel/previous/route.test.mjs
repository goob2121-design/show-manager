import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source=readFileSync(new URL("./route.ts",import.meta.url),"utf8");
test("previous personnel preview is authenticated, date-based, and read-only",()=>{
 assert.match(source,/verifyAdminSessionCookieValue/); assert.match(source,/uuid\.test\(showId\)/); assert.match(source,/\.lt\("show_date",current\.show_date\)/); assert.match(source,/order\("show_date",\{ascending:false\}\)/); assert.match(source,/\.eq\("entry_kind","personnel"\)/); assert.match(source,/personnelCount:rows\.length/); assert.match(source,/totalPersonnelPay/); assert.doesNotMatch(source,/\.insert\(|\.update\(|\.delete\(/);
});

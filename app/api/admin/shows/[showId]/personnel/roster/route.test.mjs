import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
test("standard roster is authenticated, active-only, and snapshot based", () => {
  assert.match(source, /verifyAdminSessionCookieValue/);
  assert.match(source, /\.eq\("is_active", true\)/);
  assert.match(source, /personnel_profile_id: profile\.id/);
  assert.match(source, /payee_name: profile\.display_name/);
  assert.match(source, /role_snapshot: profile\.default_role/);
  assert.match(source, /amount: profile\.default_pay_amount/);
  assert.match(source, /paid: false/);
  assert.match(source, /error\?\.code === "23505"/);
});

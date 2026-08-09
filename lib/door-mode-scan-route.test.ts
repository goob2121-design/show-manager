import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("door scan lookup route is authenticated, POST-only, and uses direct scan_token lookup", () => {
  const sourcePath = fileURLToPath(new URL("../app/api/admin/shows/[showId]/door-scan-lookup/route.ts", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");

  assert.match(source, /export async function POST/);
  assert.match(source, /resolveDoorAccess/);
  assert.match(source, /getDoorStaffSessionCookieName/);
  assert.match(source, /\.eq\("scan_token", normalizedToken\)/);
  assert.match(source, /\.eq\("show_id", show\.id\)/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /\.delete\(/);
});

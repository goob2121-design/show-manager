import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("./route.ts", import.meta.url);
const migrationPath = new URL("../../../../../supabase/migrations/20260821_add_email_discount_codes.sql", import.meta.url);

test("saved discount codes are admin-only global Email Center metadata", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /verifyAdminSessionCookieValue/);
  assert.match(source, /from\("email_discount_codes"\)/);
  assert.doesNotMatch(source, /SQUARE|RESEND_API_KEY|show_reserved|seat_assignment|finance/i);
});

test("saved discount codes support create and edit without deletion", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /\["create", "update"\]/);
  assert.match(source, /\.insert\(values\)/);
  assert.match(source, /\.update\(values\)\.eq\("id", id\)/);
  assert.doesNotMatch(source, /\.delete\(/);
});

test("migration enforces case-insensitive uniqueness, status, HTTPS, and private access", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /lower\(btrim\(code\)\)/);
  assert.match(sql, /status in \('active', 'inactive'\)/);
  assert.match(sql, /ticket_url ~\* '\^https:\/\/'/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all.*anon, authenticated/);
});

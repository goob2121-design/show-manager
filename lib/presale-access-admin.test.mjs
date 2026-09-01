import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Show Details stores an optional normalized presale access code", async () => {
  const [component, types, migration] = await Promise.all([
    readFile(new URL("../app/components/show-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("types.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260901_add_presale_access_code.sql", import.meta.url), "utf8"),
  ]);
  assert.match(types, /presale_access_code: string \| null/);
  assert.match(component, /Presale Access Code/);
  assert.match(component, /presale_access_code: normalizeOptionalField\(showDetailsFormState\.presaleAccessCode\)/);
  assert.match(component, /function normalizeOptionalField[\s\S]*?\.trim\(\)[\s\S]*?return trimmedValue \? trimmedValue : null/);
  assert.match(migration, /add column if not exists presale_access_code text/);
  assert.match(migration, /add column if not exists presale_access_code_snapshot text/);
});

test("existing public show status never selects or returns the access code", async () => {
  const source = await readFile(new URL("../app/api/public/ticket-sales-status/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /presale_access_code/);
});

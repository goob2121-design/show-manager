import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = new URL("./saved-discount-codes.tsx", import.meta.url);

test("saved code picker excludes inactive and expired codes", async () => {
  const source = await readFile(path, "utf8");
  assert.match(source, /item\.status === "active"/);
  assert.match(source, /!item\.expires_at \|\| item\.expires_at >= today/);
  assert.match(source, /activeCodes\.map/);
});

test("selecting a saved code populates a one-time editable snapshot", async () => {
  const source = await readFile(path, "utf8");
  assert.match(source, /onSelect\(\{ code: saved\.code, offerText: saved\.offer_text \?\? "", ticketUrl: saved\.ticket_url \?\? "" \}\)/);
  assert.match(source, /function choose\(id: string\)/);
});

test("management supports create, edit, active state, and no deletion", async () => {
  const source = await readFile(path, "utf8");
  assert.match(source, /editingId \? "update" : "create"/);
  assert.match(source, /edit\(saved\)/);
  assert.match(source, /option value="inactive"/);
  assert.doesNotMatch(source, /action:\s*"delete"|\.delete\(/);
});

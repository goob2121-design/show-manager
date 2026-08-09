import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/components/admin-quick-nav.tsx", "utf8");

test("Admin Quick Nav wrapper uses explicit dark StageFlow colors", () => {
  assert.match(source, /print-hidden rounded-2xl border border-slate-700 bg-slate-900\/70/);
  assert.doesNotMatch(source, /print-hidden rounded-2xl border border-stone-200 bg-stone-50\/90/);
});

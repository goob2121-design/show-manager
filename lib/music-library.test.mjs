import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const exports = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("./music-library.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports });
test("standalone library reads every reusable song without show, guest or write operations", async () => {
  const songs = Array.from({ length: 1201 }, (_, i) => ({ id: String(i), title: String(1201 - i).padStart(4, "0"), lyrics: "Original" }));
  const ranges = [];
  const query = { select(fields) { assert.ok(fields.includes("lyrics")); return this; }, order(field) { assert.equal(field, "id"); return this; }, async range(start, end) { ranges.push([start, end]); return { data: songs.slice(start, end + 1), error: null }; } };
  const result = await exports.loadMusicLibrary({ from(table) { assert.equal(table, "songs"); return query; } });
  assert.equal(result.length, 1201);
  assert.equal(new Set(result.map(song => song.id)).size, 1201);
  assert.equal(result[0].title, "0001");
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);
});
test("a failed batch rejects instead of showing an incomplete library", async () => {
  await assert.rejects(exports.loadMusicLibrary({ from() { return { select() { return this; }, order() { return this; }, range: async () => ({ data: null, error: new Error("Read failed") }) }; } }), /Read failed/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("reserved-seat confirmation print styles avoid blanket visibility hiding", () => {
  const sourcePath = fileURLToPath(new URL("./reserved-seat-selection-page.tsx", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");

  assert.match(source, /className="confirmation-print-root/);
  assert.match(source, /\.seat-confirmation-screen\s*\{\s*display:\s*none !important;/);
  assert.match(source, /\.seat-confirmation-print \.ticket-code-block\s*\{\s*break-inside:\s*avoid !important;/);
  assert.doesNotMatch(source, /body \* \{\s*visibility:\s*hidden;/);
});

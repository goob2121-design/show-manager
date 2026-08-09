import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/page.tsx", "utf8");

test("landing page reuses the existing default current/upcoming show loader", () => {
  assert.match(source, /loadDefaultAvailableSeatsShow/);
  assert.doesNotMatch(source, /cmms081526/);
});

test("landing page keeps the primary entrance and adds the scoped Door Staff login", () => {
  assert.match(source, /ENTER STAGEFLOW/);
  assert.match(source, /DOOR STAFF LOGIN/);
  assert.match(source, /\/admin\/\$\{encodeURIComponent\(currentShow\.slug\)\}\/door\/login/);
  assert.match(source, /currentShow\?\.slug/);
});

test("public-links copy no longer lists Door Mode", () => {
  assert.match(source, /Public links for Band, Guest, MC, and Live Mode continue to work directly\./);
  assert.doesNotMatch(source, /Public links[^\n]*Door Mode/);
});

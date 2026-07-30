import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
import { normalizeStageFlowPublicUrl } from "./stageflow-public-url.ts";

test("production accepts HTTPS origins and rejects HTTP including localhost", () => {
  assert.equal(
    normalizeStageFlowPublicUrl("https://stageflow.cumberlandmountainmusic.com", { nodeEnv: "production" }),
    "https://stageflow.cumberlandmountainmusic.com",
  );
  assert.throws(
    () => normalizeStageFlowPublicUrl("http://localhost:3000", { nodeEnv: "production" }),
    /HTTPS origin/,
  );
});

test("development allows HTTP only for loopback origins", () => {
  assert.equal(normalizeStageFlowPublicUrl("http://localhost:3000", { nodeEnv: "development" }), "http://localhost:3000");
  assert.equal(normalizeStageFlowPublicUrl("http://127.0.0.1:3000", { nodeEnv: "test" }), "http://127.0.0.1:3000");
  assert.throws(
    () => normalizeStageFlowPublicUrl("http://stageflow.example.com", { nodeEnv: "development" }),
    /localhost HTTP origin/,
  );
});

test("development uses a valid request origin only when configuration is absent", () => {
  assert.equal(
    normalizeStageFlowPublicUrl(undefined, { nodeEnv: "development", requestOrigin: "http://localhost:3000" }),
    "http://localhost:3000",
  );
  assert.equal(
    normalizeStageFlowPublicUrl("https://configured.example.com", { nodeEnv: "development", requestOrigin: "http://localhost:3000" }),
    "https://configured.example.com",
  );
  assert.throws(
    () => normalizeStageFlowPublicUrl(undefined, { nodeEnv: "production", requestOrigin: "http://localhost:3000" }),
    /not configured/,
  );
});

test("malformed origins, paths, queries, hashes, and credentials remain rejected", () => {
  for (const value of [
    "not a url",
    "http://localhost:3000/tickets",
    "http://localhost:3000?ticket=1",
    "http://localhost:3000#tickets",
    "http://user:password@localhost:3000",
  ]) {
    assert.throws(() => normalizeStageFlowPublicUrl(value, { nodeEnv: "development" }));
  }
});
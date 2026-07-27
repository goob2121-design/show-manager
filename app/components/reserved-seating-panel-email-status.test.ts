import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelPath = new URL("./reserved-seating-panel.tsx", import.meta.url);

test("reserved seating panel shows loading copy instead of tracking unavailable fallback", async () => {
  const source = await readFile(panelPath, "utf8");
  assert.match(source, /getReservedSeatEmailStatusDisplayModel/);
  assert.match(source, /emailTrackingRequestState/);
  assert.match(source, /handleRetryEmailTracking/);
  assert.match(source, /setEmailTrackingRequestState\("loading"\)/);
  assert.doesNotMatch(source, /prominentLabel \?\? "Tracking unavailable"/);
});

test("reserved seating panel preserves prior statuses on refresh failure", async () => {
  const source = await readFile(panelPath, "utf8");
  assert.match(source, /setEmailStatuses\(Object\.fromEntries/);
  assert.doesNotMatch(source, /setEmailStatuses\(\{\}\);\s*\r?\n\s*setEmailTrackingRequestState\("error"\)/);
});

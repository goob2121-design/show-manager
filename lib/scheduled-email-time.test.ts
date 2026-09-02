import assert from "node:assert/strict";
import test from "node:test";
import { isScheduledEmailDue, scheduledEmailRunForEasternDate } from "./scheduled-email-time";

test("summer Eastern date maps to the real 04:15 UTC daily cron", () => {
  assert.equal(scheduledEmailRunForEasternDate("2026-09-07", new Date("2026-09-01T00:00:00Z"))?.toISOString(), "2026-09-07T04:15:00.000Z");
});

test("a missed daily run moves to the next actual scheduler opportunity", () => {
  assert.equal(scheduledEmailRunForEasternDate("2026-09-01", new Date("2026-09-01T05:00:00Z"))?.toISOString(), "2026-09-02T04:15:00.000Z");
});

test("future campaigns do not become due early", () => {
  assert.equal(isScheduledEmailDue("2026-09-07T04:15:00.000Z", new Date("2026-09-07T04:14:59Z")), false);
  assert.equal(isScheduledEmailDue("2026-09-07T04:15:00.000Z", new Date("2026-09-07T04:15:00Z")), true);
});

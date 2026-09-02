import assert from "node:assert/strict";
import test from "node:test";
import { isNextCalendarDayPresaleDelivery, nextDailyPresaleSchedulerRun } from "./presale-scheduler-time";

test("future presale before the daily run uses that day's first available cron", () => {
  const next = nextDailyPresaleSchedulerRun("2026-09-02T04:00:00.000Z", new Date("2026-09-01T16:00:00.000Z"));
  assert.equal(next?.toISOString(), "2026-09-02T04:15:00.000Z");
  assert.equal(isNextCalendarDayPresaleDelivery("2026-09-02T04:00:00.000Z", next), false);
});

test("a missed daily run moves automatic delivery to the next actual run", () => {
  const next = nextDailyPresaleSchedulerRun("2026-09-01T04:00:00.000Z", new Date("2026-09-01T05:00:00.000Z"));
  assert.equal(next?.toISOString(), "2026-09-02T04:15:00.000Z");
  assert.equal(isNextCalendarDayPresaleDelivery("2026-09-01T04:00:00.000Z", next), true);
});

test("presale after the daily run is clearly a next-day delivery", () => {
  const next = nextDailyPresaleSchedulerRun("2026-09-01T05:00:00.000Z", new Date("2026-08-31T16:00:00.000Z"));
  assert.equal(next?.toISOString(), "2026-09-02T04:15:00.000Z");
  assert.equal(isNextCalendarDayPresaleDelivery("2026-09-01T05:00:00.000Z", next), true);
});

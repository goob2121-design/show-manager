import assert from "node:assert/strict";
import test from "node:test";

const displayModulePromise = import(new URL("./reserved-seat-email-status-display.ts", import.meta.url).href);

test("loading state says Loading email tracking", async () => {
  const { getReservedSeatEmailStatusDisplayModel } = await displayModulePromise;
  const model = getReservedSeatEmailStatusDisplayModel({ emailStatus: null, requestState: "loading" });

  assert.equal(model.prominentLabel, "Loading email tracking\u2026");
  assert.equal(model.showRetryButton, false);
  assert.equal(model.showCompactBadge, false);
});

test("successful API payload renders Website Link Clicked with history", async () => {
  const { getReservedSeatEmailStatusDisplayModel } = await displayModulePromise;
  const model = getReservedSeatEmailStatusDisplayModel({
    requestState: "loaded",
    emailStatus: {
      prominentLabel: "Website Link Clicked",
      prominentTimestamp: "2026-07-27T15:28:50.452+00:00",
      trackingAvailable: true,
      history: [
        { label: "Sent", timestamp: "2026-07-27T15:27:31.688+00:00" },
        { label: "Delivered", timestamp: "2026-07-27T15:27:32.833+00:00" },
        { label: "Opened (estimated)", timestamp: "2026-07-27T15:28:31.787+00:00" },
        { label: "Seat Link Clicked", timestamp: "2026-07-27T15:28:37.891+00:00" },
        { label: "Venue Link Clicked", timestamp: "2026-07-27T15:28:41.502+00:00" },
        { label: "Website Link Clicked", timestamp: "2026-07-27T15:28:50.452+00:00" },
      ],
    },
  });

  assert.equal(model.prominentLabel, "Website Link Clicked");
  assert.equal(model.compactBadgeLabel, "Website Link Clicked");
  assert.equal(model.showCompactBadge, true);
  assert.equal(model.showHistory, true);
  assert.deepEqual(model.history.map((entry: { label: string }) => entry.label), [
    "Sent", "Delivered", "Opened (estimated)", "Seat Link Clicked", "Venue Link Clicked", "Website Link Clicked",
  ]);
});

test("helper-returned Tracking unavailable still renders", async () => {
  const { getReservedSeatEmailStatusDisplayModel } = await displayModulePromise;
  const model = getReservedSeatEmailStatusDisplayModel({
    requestState: "loaded",
    emailStatus: {
      prominentLabel: "Tracking unavailable",
      prominentTimestamp: "2026-07-27T15:27:31.688+00:00",
      trackingAvailable: false,
      history: [{ label: "Sent", timestamp: "2026-07-27T15:27:31.688+00:00" }],
    },
  });

  assert.equal(model.prominentLabel, "Tracking unavailable");
});

test("failed request renders Tracking status could not be loaded with retry", async () => {
  const { getReservedSeatEmailStatusDisplayModel } = await displayModulePromise;
  const model = getReservedSeatEmailStatusDisplayModel({ emailStatus: null, requestState: "error" });

  assert.equal(model.prominentLabel, "Tracking status could not be loaded");
  assert.equal(model.showRetryButton, true);
});

test("failed refresh does not erase previously loaded statuses", async () => {
  const { getReservedSeatEmailStatusDisplayModel } = await displayModulePromise;
  const model = getReservedSeatEmailStatusDisplayModel({
    requestState: "error",
    emailStatus: {
      prominentLabel: "Website Link Clicked",
      prominentTimestamp: "2026-07-27T15:28:50.452+00:00",
      trackingAvailable: true,
      history: [{ label: "Website Link Clicked", timestamp: "2026-07-27T15:28:50.452+00:00" }],
    },
  });

  assert.equal(model.prominentLabel, "Website Link Clicked");
  assert.equal(model.showRetryButton, true);
  assert.equal(model.secondaryMessage, "Tracking status could not be loaded");
});

test("status labels map to accessible icon-and-color presentation", async () => {
  const { getReservedSeatEmailStatusVisual } = await displayModulePromise;
  const expected = [
    ["Sent", "\u{1F4E7}", "blue"],
    ["Delivered", "\u{1F4EC}", "green"],
    ["Opened (estimated)", "\u{1F441}", "cyan"],
    ["Seat Link Clicked", "\u{1F39F}", "gold"],
    ["Venue Link Clicked", "\u{1F4CD}", "orange"],
    ["Website Link Clicked", "\u{1F310}", "purple"],
    ["Delivery Delayed", "\u23F1", "amber"],
    ["Failed", "\u26D4", "red"],
    ["Bounced", "\u21A9", "red"],
    ["Reported as Spam", "\u26A0", "red"],
  ] as const;

  for (const [label, icon, tone] of expected) {
    assert.deepEqual(getReservedSeatEmailStatusVisual(label), { icon, tone });
  }
});

test("timestamps use New York calendar days, including the UTC date boundary", async () => {
  const { formatReservedSeatEmailTimestamp } = await displayModulePromise;
  const now = new Date("2026-07-27T16:00:00.000Z");

  assert.equal(formatReservedSeatEmailTimestamp("2026-07-27T15:28:00.000Z", now), "Today at 11:28 AM");
  assert.equal(formatReservedSeatEmailTimestamp("2026-07-26T23:25:00.000Z", now), "Yesterday at 7:25 PM");
  assert.equal(formatReservedSeatEmailTimestamp("2026-07-25T20:41:00.000Z", now), "Jul 25 at 4:41 PM");
  assert.equal(formatReservedSeatEmailTimestamp("2025-07-25T20:41:00.000Z", now), "Jul 25, 2025 at 4:41 PM");
  assert.equal(formatReservedSeatEmailTimestamp("2026-07-27T02:30:00.000Z", now), "Yesterday at 10:30 PM");
});

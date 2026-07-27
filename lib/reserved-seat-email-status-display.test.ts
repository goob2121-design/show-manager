import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error TS5097 needed for direct node test execution against the TS source file.
import { getReservedSeatEmailStatusDisplayModel } from "./reserved-seat-email-status-display.ts";

test("loading state says Loading email tracking", () => {
  const model = getReservedSeatEmailStatusDisplayModel({
    emailStatus: null,
    requestState: "loading",
  });

  assert.equal(model.prominentLabel, "Loading email tracking…");
  assert.equal(model.showRetryButton, false);
});

test("successful API payload renders Website Link Clicked with history", () => {
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
  assert.equal(model.showHistory, true);
  assert.deepEqual(
    model.history.map((entry) => entry.label),
    ["Sent", "Delivered", "Opened (estimated)", "Seat Link Clicked", "Venue Link Clicked", "Website Link Clicked"],
  );
});

test("helper-returned Tracking unavailable still renders", () => {
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

test("failed request renders Tracking status could not be loaded with retry", () => {
  const model = getReservedSeatEmailStatusDisplayModel({
    emailStatus: null,
    requestState: "error",
  });

  assert.equal(model.prominentLabel, "Tracking status could not be loaded");
  assert.equal(model.showRetryButton, true);
});

test("failed refresh does not erase previously loaded statuses", () => {
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

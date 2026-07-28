import assert from "node:assert/strict";
import test from "node:test";

const trackingModulePromise = import(new URL("./reserved-seat-email-tracking.ts", import.meta.url).href);
type ReservedSeatEmailEventRecord = Awaited<typeof trackingModulePromise> extends { default: unknown } ? never : import("./reserved-seat-email-tracking").ReservedSeatEmailEventRecord;

function makeEvent(overrides: Partial<ReservedSeatEmailEventRecord>): ReservedSeatEmailEventRecord {
  return {
    id: "event_1",
    resend_email_id: "re_123",
    reserved_seating_link_id: "link_1",
    event_type: "email.delivered",
    event_created_at: "2026-07-27T14:00:00.000Z",
    received_at: "2026-07-27T14:00:01.000Z",
    recipient: "guest@example.com",
    click_target: null,
    raw_event_id: "msg_1",
    ...overrides,
  };
}

test("clicked seat-selection URLs are sanitized to a safe classification", async () => {
  const { classifyReservedSeatEmailClickTarget, getReservedSeatEmailStatusLabel } = await trackingModulePromise;
  assert.equal(
    classifyReservedSeatEmailClickTarget("https://stageflow.cumberlandmountainmusic.com/reserved-seating/private-token-123"),
    "seat_selection",
  );
  assert.equal(getReservedSeatEmailStatusLabel("email.clicked", "seat_selection"), "Seat Link Clicked");
});

test("website and venue links classify without storing the raw URL", async () => {
  const { classifyReservedSeatEmailClickTarget } = await trackingModulePromise;
  assert.equal(
    classifyReservedSeatEmailClickTarget("https://www.cumberlandmountainmusic.com/contact"),
    "website_link",
  );
  assert.equal(
    classifyReservedSeatEmailClickTarget("https://www.google.com/maps/search/?api=1&query=Cumberland+Gap"),
    "venue_link",
  );
});

test("bounce and failure statuses outrank delivered and opened", async () => {
  const { deriveReservedSeatEmailTrackingSummary } = await trackingModulePromise;
  const summary = deriveReservedSeatEmailTrackingSummary({
    sentAt: "2026-07-27T13:58:00.000Z",
    resendEmailId: "re_123",
    events: [
      makeEvent({ event_type: "email.delivered", event_created_at: "2026-07-27T14:00:00.000Z" }),
      makeEvent({ id: "event_2", event_type: "email.opened", event_created_at: "2026-07-27T14:02:00.000Z" }),
      makeEvent({ id: "event_3", event_type: "email.bounced", event_created_at: "2026-07-27T14:05:00.000Z" }),
    ],
  });

  assert.equal(summary.prominentLabel, "Bounced");
  assert.equal(summary.history.some((entry: { label: string }) => entry.label === "Opened (estimated)"), true);
});

test("older sent markers safely report tracking unavailable without claiming not opened", async () => {
  const { deriveReservedSeatEmailTrackingSummary } = await trackingModulePromise;
  const summary = deriveReservedSeatEmailTrackingSummary({
    sentAt: "2026-07-27T13:58:00.000Z",
    resendEmailId: "sent:legacy-marker",
    events: [],
  });

  assert.equal(summary.prominentLabel, "Tracking unavailable");
  assert.equal(summary.history.some((entry: { label: string }) => /not opened/i.test(entry.label)), false);
});
test("local sent_at fallback is hidden when the current provider Sent event exists", async () => {
  const { deriveReservedSeatEmailTrackingSummary } = await trackingModulePromise;
  const summary = deriveReservedSeatEmailTrackingSummary({
    sentAt: "2026-07-27T14:00:00.000Z",
    resendEmailId: "re_current",
    events: [makeEvent({ event_type: "email.sent", resend_email_id: "re_current", event_created_at: "2026-07-27T14:00:01.000Z" })],
  });

  assert.deepEqual(summary.history.filter((entry: { label: string }) => entry.label === "Sent"), [
    { label: "Sent", timestamp: "2026-07-27T14:00:01.000Z" },
  ]);
});

test("local sent_at remains as the Sent fallback when no current provider Sent event exists", async () => {
  const { deriveReservedSeatEmailTrackingSummary } = await trackingModulePromise;
  const summary = deriveReservedSeatEmailTrackingSummary({
    sentAt: "2026-07-27T14:00:00.000Z",
    resendEmailId: "re_current",
    events: [makeEvent({ event_type: "email.delivered", resend_email_id: "re_current", event_created_at: "2026-07-27T14:00:02.000Z" })],
  });

  assert.deepEqual(summary.history.map((entry: { label: string }) => entry.label), ["Sent", "Delivered"]);
});

test("distinct legitimate provider Sent events remain separate and chronological", async () => {
  const { deriveReservedSeatEmailTrackingSummary } = await trackingModulePromise;
  const summary = deriveReservedSeatEmailTrackingSummary({
    sentAt: "2026-07-27T15:00:00.000Z",
    resendEmailId: "re_second",
    events: [
      makeEvent({ id: "sent_2", event_type: "email.sent", resend_email_id: "re_second", event_created_at: "2026-07-27T15:00:01.000Z" }),
      makeEvent({ id: "sent_1", event_type: "email.sent", resend_email_id: "re_first", event_created_at: "2026-07-27T14:00:01.000Z" }),
    ],
  });

  assert.deepEqual(summary.history, [
    { label: "Sent", timestamp: "2026-07-27T14:00:01.000Z" },
    { label: "Sent", timestamp: "2026-07-27T15:00:01.000Z" },
  ]);
});

test("Sent fallback cleanup leaves all other provider event types untouched", async () => {
  const { deriveReservedSeatEmailTrackingSummary } = await trackingModulePromise;
  const summary = deriveReservedSeatEmailTrackingSummary({
    sentAt: "2026-07-27T14:00:00.000Z",
    resendEmailId: "re_current",
    events: [
      makeEvent({ event_type: "email.sent", resend_email_id: "re_current", event_created_at: "2026-07-27T14:00:01.000Z" }),
      makeEvent({ id: "delivered", event_type: "email.delivered", resend_email_id: "re_current", event_created_at: "2026-07-27T14:00:02.000Z" }),
      makeEvent({ id: "opened", event_type: "email.opened", resend_email_id: "re_current", event_created_at: "2026-07-27T14:00:03.000Z" }),
    ],
  });

  assert.deepEqual(summary.history.map((entry: { label: string }) => entry.label), ["Sent", "Delivered", "Opened (estimated)"]);
});

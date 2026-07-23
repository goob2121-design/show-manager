import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReservedSeatEmail,
  RESERVED_SEAT_EMAIL_FROM,
  RESERVED_SEAT_EMAIL_REPLY_TO,
  sendReservedSeatEmail,
  type ReservedSeatEmailInput,
} from "./reserved-seat-email";
import {
  buildReservedSeatSelectionUrl,
  getStageFlowEmailLogoUrl,
  normalizeStageFlowPublicUrl,
} from "../server/stageflow-public-url";

process.env.STAGEFLOW_PUBLIC_URL = "https://stageflow.cumberlandmountainmusic.com";

const input: ReservedSeatEmailInput = {
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  showName: "Cumberland Mountain Music Show",
  showDate: "August 15, 2026",
  showTime: "7:00 PM",
  venueName: "Cumberland Gap Convention Center",
  venueAddress: "601 Colwyn Street, Cumberland Gap, TN",
  ticketCount: 2,
  seatSelectionUrl: "https://stageflow.cumberlandmountainmusic.com/reserved-seating/private-token",
  logoUrl: "https://stageflow.cumberlandmountainmusic.com/cmms-logo.png",
};

test("builds the reserved-seat subject and absolute StageFlow assets", () => {
  const email = buildReservedSeatEmail(input);
  assert.equal(email.subject, "Select Your Reserved Seats - Cumberland Mountain Music Show");
  assert.match(email.html, /https:\/\/stageflow\.cumberlandmountainmusic\.com\/reserved-seating\/private-token/);
  assert.match(email.text, /https:\/\/stageflow\.cumberlandmountainmusic\.com\/reserved-seating\/private-token/);
  assert.match(email.html, /https:\/\/stageflow\.cumberlandmountainmusic\.com\/cmms-logo\.png/);
  assert.match(email.html, /Please choose your 2 reserved seats\./);
  assert.match(email.text, /Please choose your 2 reserved seats\./);
});

test("uses the production sender and reply-to addresses", () => {
  assert.equal(RESERVED_SEAT_EMAIL_FROM, "Cumberland Mountain Music Show <tickets@cumberlandmountainmusic.com>");
  assert.equal(RESERVED_SEAT_EMAIL_REPLY_TO, "info@cumberlandmountainmusic.com");
});

test("rejects a missing customer email before sending", async () => {
  const result = await sendReservedSeatEmail({ ...input, customerEmail: "" });
  assert.equal(result.success, false);
  assert.equal(result.error, "A valid customer email is required.");
});

test("rejects a missing seat-selection URL before sending", async () => {
  const result = await sendReservedSeatEmail({ ...input, seatSelectionUrl: "" });
  assert.equal(result.success, false);
  assert.equal(result.error, "Seat-selection URL must use the configured StageFlow public URL.");
});

test("normalizes whitespace and trailing slashes from the public URL", () => {
  assert.equal(normalizeStageFlowPublicUrl("  https://stageflow.cumberlandmountainmusic.com///  "), "https://stageflow.cumberlandmountainmusic.com");
});

test("builds the canonical seat-selection and logo URLs", () => {
  assert.equal(buildReservedSeatSelectionUrl("private-token"), "https://stageflow.cumberlandmountainmusic.com/reserved-seating/private-token");
  assert.equal(getStageFlowEmailLogoUrl(), "https://stageflow.cumberlandmountainmusic.com/cmms-logo.png");
});

test("does not fall back to a different deployment host", () => {
  process.env.STAGEFLOW_PUBLIC_URL = "";
  process.env.NEXT_PUBLIC_SITE_URL = "https://shows.pinnaclestudiotn.com";
  assert.throws(() => buildReservedSeatSelectionUrl("private-token"), /STAGEFLOW_PUBLIC_URL is not configured/);
  process.env.STAGEFLOW_PUBLIC_URL = "https://stageflow.cumberlandmountainmusic.com";
});

test("rejects invalid configuration and mismatched seat-link origins", async () => {
  assert.throws(() => normalizeStageFlowPublicUrl("http://stageflow.cumberlandmountainmusic.com"), /HTTPS origin/);
  const result = await sendReservedSeatEmail({ ...input, seatSelectionUrl: "https://example.com/reserved-seating/private-token" });
  assert.equal(result.success, false);
  assert.equal(result.error, "Seat-selection URL must use the configured StageFlow public URL.");
});

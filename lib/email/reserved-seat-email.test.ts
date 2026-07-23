import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReservedSeatEmail,
  RESERVED_SEAT_EMAIL_FROM,
  RESERVED_SEAT_EMAIL_REPLY_TO,
  sendReservedSeatEmail,
  type ReservedSeatEmailInput,
} from "./reserved-seat-email";

const input: ReservedSeatEmailInput = {
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  showName: "Cumberland Mountain Music Show",
  showDate: "August 15, 2026",
  showTime: "7:00 PM",
  venueName: "Cumberland Gap Convention Center",
  venueAddress: "601 Colwyn Street, Cumberland Gap, TN",
  ticketCount: 2,
  seatSelectionUrl: "https://example.com/reserved-seating/private-token",
  logoUrl: "https://example.com/cmms-logo.png",
};

test("builds the reserved-seat subject and both link formats", () => {
  const email = buildReservedSeatEmail(input);
  assert.equal(email.subject, "Select Your Reserved Seats - Cumberland Mountain Music Show");
  assert.match(email.html, /https:\/\/example\.com\/reserved-seating\/private-token/);
  assert.match(email.text, /https:\/\/example\.com\/reserved-seating\/private-token/);
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
  assert.equal(result.error, "A valid seat-selection URL is required.");
});

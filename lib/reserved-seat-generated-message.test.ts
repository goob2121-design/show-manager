import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReservedSeatingMessageBody,
  buildReservedSeatingMessageSubject,
} from "./reserved-seat-generated-message";

test("generate message remains plain-text and copy friendly", () => {
  const body = buildReservedSeatingMessageBody({
    customerName: "Jane Doe",
    ticketCount: 2,
    absoluteUrl: "http://localhost:3000/reserved-seating/private-token",
    formattedDate: "August 15, 2026",
  });

  assert.equal(buildReservedSeatingMessageSubject(), "Your Reserved Seating Link for Cumberland Mountain Music Show");
  assert.match(body, /http:\/\/localhost:3000\/reserved-seating\/private-token/);
  assert.doesNotMatch(body, /data:image\//);
  assert.doesNotMatch(body, /stf_[A-Z0-9]+/);
  assert.match(body, /Please choose up to 2 seats\./);
});

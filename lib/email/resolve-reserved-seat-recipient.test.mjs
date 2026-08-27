import assert from "node:assert/strict";
import test from "node:test";
import { selectReservedSeatRecipientEmail } from "./resolve-reserved-seat-recipient.ts";

test("recipient precedence prefers reservation then comp ticket then sponsor library", () => {
  assert.equal(selectReservedSeatRecipientEmail({ reservedSeatEmail: " reservation@example.com ", compTicketEmail: "comp@example.com", sponsorLibraryEmail: "sponsor@example.com" }), "reservation@example.com");
  assert.equal(selectReservedSeatRecipientEmail({ reservedSeatEmail: null, compTicketEmail: " comp@example.com ", sponsorLibraryEmail: "sponsor@example.com" }), "comp@example.com");
  assert.equal(selectReservedSeatRecipientEmail({ reservedSeatEmail: "", compTicketEmail: null, sponsorLibraryEmail: " sponsor@example.com " }), "sponsor@example.com");
});

test("recipient remains missing when no linked source has an email", () => {
  assert.equal(selectReservedSeatRecipientEmail({ reservedSeatEmail: "  ", compTicketEmail: null, sponsorLibraryEmail: "" }), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  getManualEmailSender,
  getManualEmailTemplate,
  isValidManualEmailAddress,
  MANUAL_EMAIL_REPLY_TO,
  manualEmailSenders,
  manualEmailTemplates,
} from "./manual-email-center.ts";

test("Email Center sender identities are allowlisted with the required Reply-To", () => {
  assert.equal(MANUAL_EMAIL_REPLY_TO, "info@cumberlandmountainmusic.com");
  assert.deepEqual(
    manualEmailSenders.map((sender) => sender.from),
    [
      "Cumberland Mountain Music Show <info@cumberlandmountainmusic.com>",
      "CMMS Tickets <tickets@cumberlandmountainmusic.com>",
      "CMMS Help <help@cumberlandmountainmusic.com>",
    ],
  );
  assert.equal(getManualEmailSender("unknown"), null);
});

test("Email Center templates provide editable starter content and blank Custom fields", () => {
  assert.deepEqual(
    manualEmailTemplates.map((template) => template.label),
    [
      "General Message",
      "Complimentary Tickets",
      "Reserved Seating",
      "Sponsor Message",
      "Show Information",
      "Custom",
    ],
  );
  const complimentary = getManualEmailTemplate("complimentary_tickets");
  assert.equal(complimentary?.subject, "Complimentary Tickets - Cumberland Mountain Music Show");
  assert.match(complimentary?.message ?? "", /Hi \[Name\]/);
  assert.match(complimentary?.message ?? "", /\[Show Date\]/);
  assert.match(complimentary?.message ?? "", /Doors open at 6:00 PM and the show begins at 7:00 PM/);
  assert.deepEqual(getManualEmailTemplate("custom"), {
    key: "custom",
    label: "Custom",
    subject: "",
    message: "",
  });
});

test("Email Center recipient validation rejects malformed or oversized addresses", () => {
  assert.equal(isValidManualEmailAddress("guest@example.com"), true);
  assert.equal(isValidManualEmailAddress("not-an-email"), false);
  assert.equal(isValidManualEmailAddress("a@b"), false);
  assert.equal(isValidManualEmailAddress(`${"a".repeat(310)}@example.com`), false);
});

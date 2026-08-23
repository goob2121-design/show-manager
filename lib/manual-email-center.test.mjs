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
      "Presale / Early Access",
      "Save on Tickets / Promo Code",
      "Custom",
    ],
  );
  const complimentary = getManualEmailTemplate("complimentary_tickets");
  assert.equal(complimentary?.subject, "Complimentary Tickets - Cumberland Mountain Music Show");
  assert.match(complimentary?.message ?? "", /Hi \{\{first_name\}\}/);
  assert.match(complimentary?.message ?? "", /\{\{show_date\}\}/);
  assert.match(complimentary?.message ?? "", /Doors open at 6:00 PM and the show begins at 7:00 PM/);
  const discount = getManualEmailTemplate("ticket_discount");
  const presale = getManualEmailTemplate("presale_early_access");
  assert.equal(presale?.subject, "Your CMMS Early Access Ticket Link");
  assert.match(presale?.message ?? "", /Hi \{\{first_name\}\},/);
  assert.match(presale?.message ?? "", /\{\{show_name\}\} on \{\{show_date\}\}/);
  assert.match(presale?.message ?? "", /\{\{presale_start\}\}/);
  assert.match(presale?.message ?? "", /\{\{public_sale_start\}\}/);
  assert.equal(presale?.ctaUrl, "{{ticket_link}}");
  assert.equal(presale?.ctaLabel, "EARLY ACCESS TICKETS");
  assert.match(presale?.message ?? "", /Since you're on the CMMS Mailing List, I wanted to send you the early-access ticket link/);
  assert.match(presale?.message ?? "", /tickets open to the general public on/);
  assert.doesNotMatch(presale?.message ?? "", /Gmail users|Primary inbox|Promotions|Spam or Social/);
  assert.doesNotMatch(discount?.message ?? "", /promo_code|promo_offer|Use promo code|Get your tickets here/);
  assert.equal(discount?.ctaUrl, "{{ticket_link}}");
  assert.deepEqual(getManualEmailTemplate("custom"), {
    key: "custom",
    label: "Custom",
    subject: "",
    heading: "",
    ctaLabel: "",
    ctaUrl: "",
    message: "",
  });
});

test("Email Center recipient validation rejects malformed or oversized addresses", () => {
  assert.equal(isValidManualEmailAddress("guest@example.com"), true);
  assert.equal(isValidManualEmailAddress("not-an-email"), false);
  assert.equal(isValidManualEmailAddress("a@b"), false);
  assert.equal(isValidManualEmailAddress(`${"a".repeat(310)}@example.com`), false);
});

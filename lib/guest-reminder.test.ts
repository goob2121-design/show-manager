import assert from "node:assert/strict";
import test from "node:test";
import { getGuestReminderMissingItems } from "./guest-reminder";
import { buildGuestReminderEmail } from "./email/guest-reminder-email-content";

const complete = {
  photo_url: "https://example.com/photo.jpg",
  short_bio: "Bio",
  hometown: "Cumberland Gap, TN",
  instruments: "Vocals",
  house_band_backing_guest: false,
};

const emailInput = {
  email: "guest@example.com",
  guestName: "Guest Name",
  portalUrl: "https://stageflow.example/guest/profile-id",
};

test("non-house-band guests are never asked for songs", () => {
  assert.deepEqual(getGuestReminderMissingItems(complete, 0), []);
});

test("house-band guests are asked for songs only while missing", () => {
  assert.deepEqual(getGuestReminderMissingItems({ ...complete, house_band_backing_guest: true }, 0), ["Song Selections"]);
  assert.deepEqual(getGuestReminderMissingItems({ ...complete, house_band_backing_guest: true }, 1), []);
});

test("only incomplete profile categories are listed", () => {
  assert.deepEqual(getGuestReminderMissingItems({ ...complete, photo_url: null, short_bio: null, hometown: null }, 2), [
    "Promo Photo",
    "Guest Bio",
    "Guest Profile Information",
  ]);
});

test("missing-item reminders retain the existing list behavior", () => {
  const content = buildGuestReminderEmail({ ...emailInput, missingItems: ["Guest Bio"] });
  assert.equal(content.subject, "Items Needed for the Cumberland Mountain Music Show");
  assert.match(content.text, /We're still waiting on:/);
  assert.match(content.text, /Guest Bio/);
  assert.match(content.html, /Guest Bio/);
  assert.ok(!content.text.includes("Great news!"));
  assert.ok(!content.html.includes("Great news!"));
  assert.ok(content.html.includes(emailInput.portalUrl));
});

test("complete-profile reminders use the positive message and retain the portal", () => {
  const content = buildGuestReminderEmail({ ...emailInput, missingItems: [] });
  assert.match(content.text, /Great news!/);
  assert.match(content.text, /We've received everything we need from you\./);
  assert.match(content.text, /If you'd like to review or update your information before the show, you can still access your Guest Portal below\./);
  assert.match(content.html, /Great news!/);
  assert.match(content.html, /We&#39;ve received everything we need from you\./);
  assert.ok(content.html.includes(emailInput.portalUrl));
  assert.ok(content.html.includes("Open Your Guest Portal"));
  assert.ok(!content.text.includes("We're still waiting on:"));
});

test("complete-profile reminders support an optional admin note", () => {
  const note = "Looking forward to seeing you Saturday.";
  const content = buildGuestReminderEmail({ ...emailInput, missingItems: [], additionalNote: note });
  assert.match(content.text, /Additional Note/);
  assert.match(content.html, /Additional Note/);
  assert.ok(content.text.includes(note));
  assert.ok(content.html.includes(note));
  assert.ok(content.text.indexOf("We've received everything") < content.text.indexOf(note));
  assert.ok(content.text.indexOf(note) < content.text.indexOf("Guest Portal:"));
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";


const source = readFileSync("app/components/show-page.tsx", "utf8").replace(/\r\n/g, "\n");

function sourceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, "Missing source marker: " + start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, "Missing source marker: " + end);
  return source.slice(startIndex, endIndex);
}

test("house-band-backed guests with zero songs remain missing and incomplete", () => {
  const missingCount = sourceBetween(
    "  const guestsMissingSongsCount",
    "  const guestsMissingPromoInfoCount",
  );
  assert.match(missingCount, /profile\.house_band_backing_guest &&/);
  assert.match(missingCount, /submittedSongsCount === 0/);

  const completion = sourceBetween(
    "                  const readinessChecks = [",
    "                  const profileCompletion",
  );
  assert.match(completion, /!profile\.house_band_backing_guest \|\| hasSubmittedSongs/);
});

test("self-contained guests with zero songs are complete for songs and see optional wording", () => {
  const portalStatus = sourceBetween(
    "function getGuestProfilePortalStatus(",
    "function isGuestSongForProfile(",
  );
  assert.match(portalStatus, /if \(!profile\.house_band_backing_guest\)/);
  assert.match(portalStatus, /key: "optional"/);
  assert.match(portalStatus, /label: "Songs optional"/);
  assert.match(source, /"Songs Required: No"/);
  assert.match(source, /"No optional songs have been submitted\."/);
  assert.match(source, /"Song submission is optional for this guest\./);
  assert.match(source, /guestTabItems\.map/);
});

test("existing Guest Reminder behavior remains tied to house-band backing", () => {
  const reminderSource = readFileSync("lib/guest-reminder.ts", "utf8").replace(/\r\n/g, "\n");
  assert.match(
    reminderSource,
    /if \(profile\.house_band_backing_guest && submittedSongCount === 0\) missing\.push\("Song Selections"\)/,
  );
});
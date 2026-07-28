import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packetModulePromise = import(new URL("./sponsor-packet.ts", import.meta.url).href);
const componentPath = new URL("../app/components/sponsor-packet-builder.tsx", import.meta.url);
const routePath = new URL("../app/api/admin/shows/[showId]/sponsor-packet/route.ts", import.meta.url);

async function defaultDraft() {
  const { buildSponsorPacketDraft } = await packetModulePromise;
  return buildSponsorPacketDraft({
    sponsor: { id: "sponsor-1", name: "Community Sponsor" },
    show: { id: "show-1", slug: "show", name: "Summer Show", show_date: "2026-08-15", venue: "Convention Center", venue_address: null, show_start_time: "19:00" },
    today: "2026-07-28",
  });
}

test("new packets use the long personal letter and professional signature defaults", async () => {
  const draft = await defaultDraft();
  assert.ok(draft.thankYouMessage.length > 700);
  assert.match(draft.thankYouMessage, /On behalf of everyone involved with the Cumberland Mountain Music Show/);
  assert.match(draft.thankYouMessage, /preserving and celebrating the musical traditions/);
  assert.match(draft.thankYouMessage, /family-friendly evening of entertainment/);
  assert.equal(draft.closingName, "Bryan Turner");
  assert.equal(draft.closingTitle, "Owner & Producer");
  assert.equal(draft.contactEmail, "info@cumberlandmountainmusic.com");
});

test("cover page and assembly checklist are optional presentation-only sections", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /coverPage: false/);
  assert.match(source, /assemblyChecklist: false/);
  assert.match(source, /presentationSections\.coverPage \?/);
  assert.match(source, /presentationSections\.assemblyChecklist \?/);
  assert.match(source, /Sponsor Appreciation Packet/);
  assert.match(source, /Packet Assembly Checklist/);
  assert.match(source, /Envelope Addressed/);
  assert.match(source, /Packet Mailed/);
  assert.match(source, /do not change the saved packet draft/);
});

test("flyer and business-card insert pages are independently optional", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /eventFlyerPlaceholder/);
  assert.match(source, /businessCardPlaceholder/);
  assert.match(source, /Place the current Cumberland Mountain Music Show event flyer here/);
  assert.match(source, /Attach or insert a Cumberland Mountain Music Show contact card here/);
});

test("missing sponsor, guest, and venue images render no empty placeholder", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /draft\.sponsorLogoUrl \? <Image/);
  assert.match(source, /draft\.guestPhotoUrl \? <Image/);
  assert.match(source, /venuePhotoUrl \? <Image/);
  assert.doesNotMatch(source, /No sponsor logo|No guest photo|No venue photo/);
});

test("every generated page uses the CMMS footer and print-safe page rules", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /function PacketFooter/);
  assert.match(source, /Big-Time Show • Small-Town Hospitality/);
  assert.match(source, /www\.cumberlandmountainmusic\.com/);
  assert.match(source, /@page \{ size: letter/);
  assert.match(source, /break-after: page/);
  assert.match(source, /break-inside: avoid/);
  assert.match(source, /orphans: 3; widows: 3/);
  assert.match(source, /min-h-\[11in\]/);
  assert.ok((source.match(/<PacketFooter page=/g) ?? []).length >= 8);
});

test("long letter is rendered as separate paragraphs and may be hidden without changing draft content", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /function PacketParagraphs/);
  assert.match(source, /split\(\/\\n\\s\*\\n\//);
  assert.match(source, /presentationSections\.personalizedLetter \?/);
  const draft = await defaultDraft();
  const original = draft.thankYouMessage;
  assert.equal(draft.thankYouMessage, original);
});

test("Phase 3 choices are absent from saved-draft serialization and existing API", async () => {
  const { serializeSponsorPacketDraft } = await packetModulePromise;
  const payload = serializeSponsorPacketDraft(await defaultDraft());
  assert.equal("coverPage" in payload, false);
  assert.equal("assemblyChecklist" in payload, false);
  assert.equal("venuePhotoUrl" in payload, false);
  const route = await readFile(routePath, "utf8");
  assert.doesNotMatch(route, /coverPage|assemblyChecklist|eventFlyerPlaceholder|businessCardPlaceholder|venuePhotoUrl/);
});

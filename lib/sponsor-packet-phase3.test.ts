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

test("new packets use the refined one-page letter and professional signature defaults", async () => {
  const draft = await defaultDraft();
  assert.ok(draft.thankYouMessage.length < 1100);
  assert.match(draft.thankYouMessage, /On behalf of everyone involved with the Cumberland Mountain Music Show/);
  assert.match(draft.thankYouMessage, /preserving the traditions that make our region so special/);
  assert.match(draft.thankYouMessage, /our featured guest, venue details/);
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
  assert.doesNotMatch(source, /src=\{draft\.sponsorLogoUrl \|\| "\/cmms-logo\.png"\}/);
  assert.match(source, /value=\{draft\.guestPhotoUrl\}/);
  assert.doesNotMatch(source, /<Image src=\{draft\.guestPhotoUrl\}/);
  assert.match(source, /venuePhotoUrl \? <Image/);
  assert.doesNotMatch(source, /No sponsor logo|No guest photo|No venue photo/);
});

test("cover keeps the large CMMS identity and enlarges a sponsor logo only inside the prepared panel", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /<Image src="\/cmms-logo\.png"[^\n]*width=\{720\} height=\{432\}[^\n]*packet-cover-cmms-logo[^\n]*h-64[^\n]*object-contain/);
  assert.match(source, /Prepared Especially For/);
  assert.match(source, /draft\.sponsorLogoUrl \? <Image src=\{draft\.sponsorLogoUrl\}[^\n]*width=\{280\} height=\{140\}[^\n]*packet-cover-panel-logo[^\n]*max-h-\[8\.5rem\][^\n]*object-contain/);
  assert.match(source, /\.packet-cover-panel-logo \{[^}]*max-width: 86%[^}]*max-height: 1\.3in[^}]*object-fit: contain/);
});

test("cover print budget keeps wide, tall, square, no-logo, and long text cases on one page", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /\.packet-cover-page \{ box-sizing: border-box[^}]*height: 9\.3in[^}]*min-height: 9\.3in[^}]*max-height: 9\.3in[^}]*break-inside: avoid/);
  assert.match(source, /\.packet-cover-cmms-logo \{[^}]*max-width: 82%[^}]*max-height: 2\.15in[^}]*object-fit: contain/);
  assert.match(source, /\.packet-cover-panel-logo \{[^}]*max-width: 86%[^}]*max-height: 1\.3in[^}]*object-fit: contain/);
  assert.match(source, /packet-cover-sponsor-name[^\n]*overflow-wrap: anywhere/);
  assert.match(source, /packet-cover-contact[^\n]*overflow-wrap: anywhere/);
  assert.match(source, /packet-cover-page \.packet-prepared-card \{[^}]*margin-top: 0\.22in[^}]*padding: 0\.16in 0\.34in/);
  assert.match(source, /\.packet-cover-page \.packet-footer \{[^}]*flex: 0 0 auto[^}]*break-inside: avoid/);
  assert.equal((source.match(/packet-page packet-cover-page/g) ?? []).length, 1);
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

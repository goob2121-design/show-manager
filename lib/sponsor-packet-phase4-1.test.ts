import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packetModulePromise = import(new URL("./sponsor-packet.ts", import.meta.url).href);
const componentPath = new URL("../app/components/sponsor-packet-builder.tsx", import.meta.url);
const routePath = new URL("../app/api/admin/shows/[showId]/sponsor-packet/route.ts", import.meta.url);

function source() { return readFile(componentPath, "utf8"); }

async function draft() {
  const { buildSponsorPacketDraft } = await packetModulePromise;
  return buildSponsorPacketDraft({ sponsor: { id: "s", name: "Sponsor" }, show: { id: "show", slug: "show", name: "Show", show_date: "2026-08-15", venue: null, venue_address: null, show_start_time: "19:00" }, today: "2026-07-28" });
}

test("revised default letter is warm but removes the repeated Phase 3 gratitude paragraphs", async () => {
  const value = (await draft()).thankYouMessage;
  assert.match(value, /preserving the traditions that make our region so special/);
  assert.match(value, /our featured guest, venue details/);
  assert.match(value, /look forward to seeing you at the upcoming Cumberland Mountain Music Show/);
  assert.doesNotMatch(value, /affordable for our community/);
  assert.doesNotMatch(value, /confidence in our mission/);
  assert.doesNotMatch(value, /another great season/);
  assert.doesNotMatch(value, /It is because of partners like you/);
  assert.equal((value.match(/support/g) ?? []).length, 2);
});

test("saved custom letter remains unchanged when applied to the revised default", async () => {
  const { applySavedSponsorPacketDraft } = await packetModulePromise;
  const base = await draft();
  const saved = { id: "d", show_id: "show", sponsor_library_id: "s", personal_message: "My saved custom sponsor letter.", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", include_tickets: false, ticket_quantity: 0, admission_type: "general", enabled_sections: {}, band_members_override: null } as Parameters<typeof applySavedSponsorPacketDraft>[1];
  assert.equal(applySavedSponsorPacketDraft(base, saved).thankYouMessage, "My saved custom sponsor letter.");
});

test("letter page uses its own compact one-page strategy and keeps signature together", async () => {
  const value = await source();
  assert.match(value, /packet-letter-page/);
  assert.match(value, /font-size: 10\.35pt !important/);
  assert.match(value, /line-height: 1\.46 !important/);
  assert.match(value, /letter-content \{ gap: 0\.45rem/);
  assert.match(value, /letter-contact-block \{ margin-top: 1rem !important/);
  assert.match(value, /packet-signature \{ break-inside: avoid/);
  assert.match(value, /packet-keep packet-signature/);
});

test("standard show information uses compact readable one-page rules without clipping", async () => {
  const value = await source();
  assert.match(value, /packet-show-page/);
  assert.match(value, /line-height: 1\.34 !important/);
  assert.match(value, /show-sections \{ gap: 0\.62rem/);
  assert.doesNotMatch(value, /overflow: hidden[^\n]*packet-show-page/);
});

test("screen headings use accessible teal while print headings remain dark", async () => {
  const value = await source();
  assert.match(value, /packet-section-heading \{ color: #0e7490; \}/);
  assert.match(value, /packet-show-page \.packet-section-heading \{ color: #052e2b !important/);
  assert.match(value, /packet-section-heading border-b border-teal-500\/50/);
});

test("packet time formatting preserves explicit PM and correctly handles 24-hour morning/evening", async () => {
  const { formatSponsorPacketTime } = await packetModulePromise;
  assert.equal(formatSponsorPacketTime("7:00 PM"), "7:00 PM");
  assert.equal(formatSponsorPacketTime("19:00:00"), "7:00 PM");
  assert.equal(formatSponsorPacketTime("07:00:00"), "7:00 AM");
  assert.equal(formatSponsorPacketTime("12:00"), "12:00 PM");
  assert.equal(formatSponsorPacketTime("00:30"), "12:30 AM");
});

test("venue wording, band spacing, and concise show-page closing are present", async () => {
  const value = await source();
  assert.match(value, /Venue information and directions:/);
  assert.match(value, /mt-3 grid gap-2[^\n]*bandMembers\.filter/);
  assert.match(value, /We look forward to seeing you at the Cumberland Mountain Music Show\./);
});

test("letter print layout removes duplicated website and email from the signature while keeping editable subject", async () => {
  const value = await source();
  assert.match(value, /draft\.subject \? <h2 className="packet-heading text-xl font-semibold">\{draft\.subject\}<\/h2> : null/);
  assert.match(value, /<div className="packet-keep packet-signature pt-3"><p>Sincerely,<\/p>\{signatureImageUrl \? <Image[\s\S]*?<p>Cumberland Mountain Music Show<\/p><\/div>/);
});

test("Phase 4.1 does not alter draft serialization or API", async () => {
  const { serializeSponsorPacketDraft } = await packetModulePromise;
  const payload = serializeSponsorPacketDraft(await draft());
  assert.equal("packet-letter-page" in payload, false);
  const route = await readFile(routePath, "utf8");
  assert.doesNotMatch(route, /packet-letter-page|packet-show-page|#0e7490|formatSponsorPacketTime/);
});

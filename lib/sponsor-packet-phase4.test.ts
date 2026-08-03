import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packetModulePromise = import(new URL("./sponsor-packet.ts", import.meta.url).href);
const componentPath = new URL("../app/components/sponsor-packet-builder.tsx", import.meta.url);
const routePath = new URL("../app/api/admin/shows/[showId]/sponsor-packet/route.ts", import.meta.url);

async function source() { return readFile(componentPath, "utf8"); }

test("cover keeps the large centered CMMS logo and conditionally shows a larger sponsor panel logo", async () => {
  const value = await source();
  assert.match(value, /src="\/cmms-logo\.png"[^\n]*width=\{720\} height=\{432\}[^\n]*packet-cover-cmms-logo[^\n]*h-64[^\n]*object-contain/);
  assert.match(value, /draft\.sponsorLogoUrl \? <Image src=\{draft\.sponsorLogoUrl\}/);
  assert.match(value, /width=\{280\}/);
  assert.match(value, /height=\{140\}/);
  assert.match(value, /packet-cover-panel-logo[^\n]*max-h-\[8\.5rem\][^\n]*object-contain/);
  assert.match(value, /packet-cover-page/);
  assert.match(value, /packet-cover-label mt-8 text-xs font-semibold uppercase tracking-\[0\.24em\] text-emerald-800/);
  assert.match(value, /packet-cover-title packet-heading mt-3 text-4xl font-bold text-stone-900 print:text-\[#111111\]/);
  assert.match(value, /packet-cover-title-underline mt-3 h-\[3px\] w-36 rounded-full bg-amber-700\/80/);
  assert.doesNotMatch(value, /src=\{draft\.sponsorLogoUrl \|\| "\/cmms-logo\.png"\}/);
  assert.doesNotMatch(value, /Sponsor logo unavailable/);
});

test("optional cover watermark is subtle, grayscale, and disabled by default", async () => {
  const value = await source();
  assert.match(value, /coverWatermark: false/);
  assert.match(value, /presentationSections\.coverWatermark \?/);
  assert.match(value, /opacity-\[0\.035\] grayscale/);
});

test("print output forces headings, body, lists, tickets, and footers to near-black", async () => {
  const value = await source();
  assert.match(value, /\.packet-page, \.packet-page \* \{ color: #050505 !important; \}/);
  assert.match(value, /\.packet-page \{ background: #fff !important; \}/);
  assert.match(value, /\.packet-cover-page \.packet-cover-label \{ color: #23433d !important; opacity: 1 !important; -webkit-text-fill-color: #23433d !important; \}/);
  assert.match(value, /\.packet-cover-page \.packet-cover-title \{ color: #111111 !important; font-weight: 800 !important; opacity: 1 !important; -webkit-text-fill-color: #111111 !important; \}/);
  assert.match(value, /\.packet-cover-page \.packet-cover-title-underline \{ background: #b68a2c !important; \}/);
  assert.match(value, /\.packet-footer/);
});

test("new signature and printed fallback use Owner & Producer", async () => {
  const { buildSponsorPacketDraft } = await packetModulePromise;
  const draft = buildSponsorPacketDraft({ sponsor: { id: "s", name: "Sponsor" }, show: { id: "x", slug: "x", name: "Show", show_date: null, venue: null, venue_address: null, show_start_time: null } });
  assert.equal(draft.closingTitle, "Owner & Producer");
  const value = await source();
  assert.match(value, /draft\.closingTitle \|\| "Owner & Producer"/);
  assert.match(value, /Bryan Turner/);
  assert.match(value, /<div className="packet-keep packet-signature pt-3"><p>Sincerely,<\/p>\{signatureImageUrl \? <Image[\s\S]*?<p>Cumberland Mountain Music Show<\/p><\/div>/);
});

test("letter includes personal owner-producer closing and professional paragraph spacing", async () => {
  const value = await source();
  assert.match(value, /PacketParagraphs/);
  assert.match(value, /letter-content mt-5 space-y-3/);
  assert.match(value, /line-height: 1\.65/);
  assert.match(value, /orphans: 3; widows: 3/);
});

test("mailing address follows business-letter order with date and attention line support", async () => {
  const value = await source();
  assert.match(value, /formatSponsorPacketDate\(draft\.packetDate\)/);
  assert.match(value, /hasMailingAddress/);
  assert.match(value, /draft\.sponsorName \? <p className="font-semibold">\{draft\.sponsorName\}<\/p> : null/);
  assert.match(value, /draft\.contactPerson \? <p>Attention: \{draft\.contactPerson\}<\/p> : null/);
  assert.match(value, /mailingLines\.map/);
});

test("section headings and available photos receive consistent print-safe treatment", async () => {
  const value = await source();
  assert.match(value, /packet-section-heading border-b border-teal-500\/50 pb-1\.5 text-2xl/);
  assert.match(value, /rounded-xl border border-stone-200 object-cover p-1/);
  assert.match(value, /packet-page img \{ max-width: 100% !important; break-inside: avoid; \}/);
});

test("Phase 4 does not alter saved-draft serialization or packet API", async () => {
  const { buildSponsorPacketDraft, serializeSponsorPacketDraft } = await packetModulePromise;
  const draft = buildSponsorPacketDraft({ sponsor: { id: "s", name: "Sponsor" }, show: { id: "x", slug: "x", name: "Show", show_date: null, venue: null, venue_address: null, show_start_time: null } });
  const payload = serializeSponsorPacketDraft(draft);
  assert.equal("coverWatermark" in payload, false);
  const route = await readFile(routePath, "utf8");
  assert.doesNotMatch(route, /coverWatermark|#050505|Owner & Producer/);
});

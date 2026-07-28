import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packetModulePromise = import(new URL("./sponsor-packet.ts", import.meta.url).href);
const componentPath = new URL("../app/components/sponsor-packet-builder.tsx", import.meta.url);

function source() { return readFile(componentPath, "utf8"); }

async function baseDraft() {
  const { buildSponsorPacketDraft } = await packetModulePromise;
  return buildSponsorPacketDraft({ sponsor: { id: "s", name: "Sponsor" }, show: { id: "show", slug: "show", name: "Show", show_date: "2026-08-15", venue: "Venue", venue_address: null, show_start_time: "19:00" }, today: "2026-07-28" });
}

test("Prepared For card includes sponsor while contact person and dates stay absent", async () => {
  const value = await source();
  assert.match(value, /Prepared Especially For/);
  assert.match(value, /draft\.contactPerson \? <dl/);
  assert.match(value, /Contact Person<\/dt>/);
  assert.doesNotMatch(value, /Packet Date<\/dt>/);
  assert.doesNotMatch(value, /Show Date<\/dt>/);
});

test("every logical packet page receives Page X of Y footer data", async () => {
  const value = await source();
  assert.match(value, /Page \{page\} of \{total\}/);
  for (const page of ["cover", "contents", "letter", "show", "tickets", "flyer", "business-card", "checklist"]) assert.match(value, new RegExp(`pageNumberFor\\("${page}"\\)`));
  assert.match(value, /packet-footer \{ min-height:/);
});

test("optional TOC is limited to packets over two pages and enabled content", async () => {
  const value = await source();
  assert.match(value, /presentationSections\.tableOfContents && basePages\.length > 2/);
  assert.match(value, /draft\.sections\.showInformation \? \{ label: "Show Information"/);
  assert.match(value, /draft\.sections\.specialGuest &&/);
  assert.match(value, /draft\.sections\.bandInformation &&/);
  assert.match(value, /draft\.sections\.contactInformation &&/);
  assert.match(value, /tableOfContentsItems\.map/);
});

test("checklist is optional and contains the final assembly wording", async () => {
  const value = await source();
  assert.match(value, /assemblyChecklist: false/);
  for (const item of ["Sponsor Letter", "Complimentary Tickets Included", "Reserved Seat Cards Included", "Event Flyer Included", "Sponsor Recognition Sheet Included", "Business Card Included", "Envelope Addressed", "Packet Mailed"]) assert.match(value, new RegExp(item));
});

test("recognition has the requested default and saved custom wording still wins", async () => {
  const { DEFAULT_SPONSOR_RECOGNITION, applySavedSponsorPacketDraft } = await packetModulePromise;
  const base = await baseDraft();
  assert.equal(base.sponsorRecognition, DEFAULT_SPONSOR_RECOGNITION);
  assert.match(DEFAULT_SPONSOR_RECOGNITION, /valued sponsors/);
  const saved = { id: "d", show_id: "show", sponsor_library_id: "s", sponsor_recognition_override: "Our saved custom recognition.", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", include_tickets: false, ticket_quantity: 0, admission_type: "general", enabled_sections: {}, band_members_override: null } as Parameters<typeof applySavedSponsorPacketDraft>[1];
  assert.equal(applySavedSponsorPacketDraft(base, saved).sponsorRecognition, "Our saved custom recognition.");
});

test("signature image is optional and text signature remains the fallback", async () => {
  const value = await source();
  assert.match(value, /signatureImageUrl \? <Image/);
  assert.match(value, /draft\.closingName \|\| "Bryan Turner"/);
  assert.match(value, /Signature image URL \(optional, not saved\)/);
});

test("preview and status changes stay presentation-only", async () => {
  const value = await source();
  assert.match(value, /aria-label="Packet Status"/);
  assert.match(value, /informational for this browser session only/);
  assert.match(value, /packet-preview-shell/);
  assert.doesNotMatch(value, /signatureImageUrl[^\n]*(serializeSponsorPacketDraft|body: JSON)/);
});
test("print removes screen paper outlines while retaining the preview edge", async () => {
  const value = await source();
  assert.match(value, /@media print \{[\s\S]*?\.packet-page \{[^}]*border: 0 !important;[^}]*box-shadow: none !important;/);
  assert.match(value, /\.packet-page \{[^}]*border: 1px solid #d6d3d1;[^}]*box-shadow:/);
  assert.match(value, /\.packet-prepared-card \{ border: 0 !important; background: white !important; box-shadow: none !important; \}/);
});

test("footer stays compact in normal page flow without a boxed container", async () => {
  const value = await source();
  assert.match(value, /\.packet-footer \{ min-height: 0 !important; break-inside: avoid;/);
  assert.match(value, /border-right: 0 !important; border-bottom: 0 !important; border-left: 0 !important;/);
  assert.doesNotMatch(value, /packet-footer[^\n]*(position: fixed|position: absolute)/);
  assert.match(value, /border-t border-stone-300/);
});

test("last actual packet page cancels forced pagination and optional pages do not render when disabled", async () => {
  const value = await source();
  assert.match(value, /\.packet-preview-shell > \.packet-page:last-child \{ break-after: auto !important; page-break-after: auto !important; \}/);
  assert.match(value, /presentationSections\.tableOfContents && basePages\.length > 2/);
  assert.match(value, /showTableOfContents \? <article/);
  assert.match(value, /presentationSections\.assemblyChecklist \? <article/);
});

test("standard letter and show content each use one page wrapper with an in-page footer", async () => {
  const value = await source();
  assert.equal((value.match(/packet-page packet-letter-page/g) ?? []).length, 1);
  assert.equal((value.match(/packet-page packet-show-page/g) ?? []).length, 1);
  assert.match(value, /packet-letter-page[\s\S]*?pageNumberFor\("letter"\)/);
  assert.match(value, /packet-show-page[\s\S]*?pageNumberFor\("show"\)/);
  assert.match(value, /border-b border-teal-500\/50/);
});
test("show date renders once on the cover and once in Show Information, not in Prepared For", async () => {
  const value = await source();
  assert.match(value, /label="Show date"/);
  assert.equal((value.match(/formatSponsorPacketDate\(draft\.showDate\)/g) ?? []).length, 2);
  assert.match(value, /<strong>Date:<\/strong>/);
  assert.doesNotMatch(value, /Show Date<\/dt>/);
});
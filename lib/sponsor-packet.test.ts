import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packetModulePromise = import(new URL("./sponsor-packet.ts", import.meta.url).href);
const componentPath = new URL("../app/components/sponsor-packet-builder.tsx", import.meta.url);
const showPagePath = new URL("../app/components/show-page.tsx", import.meta.url);

const sponsor = { id: "sponsor-1", name: "Cumberland Mountain Music Show Sponsor", logo_url: "https://example.com/sponsor-logo.png", recognition_notes: "Recognized from the stage." };
const show = { id: "show-1", slug: "august-show", name: "August Show", show_date: "2026-08-15", venue: "LMU Convention Center", venue_address: "601 Colwyn Avenue", show_start_time: "19:00" };
const guest = { show_id: "show-1", name: "Featured Artist", short_bio: "A regional favorite.", full_bio: null, photo_url: null };

async function makeDraft(overrides: Record<string, unknown> = {}) {
  const { buildSponsorPacketDraft } = await packetModulePromise;
  return { ...buildSponsorPacketDraft({ sponsor, show, guest, showSponsor: { show_id: "show-1", sponsor_id: "sponsor-1", comp_ticket_allowance: 4, recognition_notes: null }, seatLabels: [], today: "2026-07-27" }), ...overrides };
}

test("existing sponsor, show, allowance, and selected-show guest populate a detached draft", async () => {
  const draft = await makeDraft();
  assert.equal(draft.sponsorName, sponsor.name);
  assert.equal(draft.showDate, "2026-08-15");
  assert.equal(draft.ticketCount, 4);
  assert.equal(draft.sponsorLogoUrl, "https://example.com/sponsor-logo.png");
  assert.equal(draft.guestName, "Featured Artist");
  draft.sponsorName = "Packet-only override";
  assert.equal(sponsor.name, "Cumberland Mountain Music Show Sponsor");
});

test("reserved seat labels come only from exact sponsor-owned links and existing assignments", async () => {
  const { findSponsorSeatLabels } = await packetModulePromise;
  const seats = findSponsorSeatLabels({
    sponsorName: sponsor.name,
    showId: show.id,
    links: [{ id: "link-1", show_id: show.id, customer_name: sponsor.name }, { id: "link-2", show_id: show.id, customer_name: "Someone Else" }],
    assignments: [{ show_id: show.id, seating_link_id: "link-1", seat_id: "R-C1" }, { show_id: show.id, seating_link_id: "link-1", seat_id: "R-C2" }, { show_id: show.id, seating_link_id: "link-2", seat_id: "R-C9" }],
  });
  assert.deepEqual(seats, ["R-C1", "R-C2"]);
  assert.deepEqual(findSponsorSeatLabels({ sponsorName: "Unknown", showId: show.id, links: [], assignments: [] }), []);
});

test("ticket wording handles singular, plural, reserved, general admission, and no-ticket packets", async () => {
  const { buildSponsorTicketParagraph } = await packetModulePromise;
  assert.equal(buildSponsorTicketParagraph(await makeDraft({ ticketCount: 1, admissionType: "general" })), "Enclosed is one complimentary general-admission ticket for the Cumberland Mountain Music Show.");
  assert.match(buildSponsorTicketParagraph(await makeDraft({ ticketCount: 4, admissionType: "reserved", seatLabels: "R-C1, R-C2, R-C3, R-C4" })) ?? "", /four complimentary reserved-seat tickets|4 complimentary reserved-seat tickets/);
  assert.match(buildSponsorTicketParagraph(await makeDraft({ ticketCount: 4, admissionType: "reserved", seatLabels: "" })) ?? "", /assistance selecting or locating your reserved seats/);
  assert.equal(buildSponsorTicketParagraph(await makeDraft({ includeTickets: false })), null);
});

test("builder uses SELECT-only reads, printable pages, optional sections, and no private fields", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /\.from\("shows"\)\.select/);
  assert.match(source, /\.from\("sponsor_library"\)\.select\("id, name"\)/);
  assert.doesNotMatch(source, /is_archived/);
  assert.match(source, /sponsorLogosResult\.error \? \[\]/);
  assert.match(source, /guestPhotosResult\.error \? \[\]/);
  assert.match(source, /showDetailsResult\.error \? \[\]/);
  assert.match(source, /\.from\("guest_profiles"\)\.select/);
  assert.match(source, /\.from\("show_reserved_seat_assignments"\)\.select/);
  assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\(/);
  assert.doesNotMatch(source, /selection_token|source_order_id|source_import_key|resend_email_id|payment_id/);
  assert.match(source, /@page \{ size: letter/);
  assert.match(source, /packet-screen-only \{ display: none/);
  assert.match(source, /window\.print\(\)/);
  assert.match(source, /draft\.sections\.specialGuest/);
  assert.match(source, /draft\.sections\.complimentaryTickets/);
});

test("Sponsors area links to the builder without replacing existing sponsor printing", async () => {
  const source = await readFile(showPagePath, "utf8");
  assert.match(source, /sponsor-packet/);
  assert.match(source, /Sponsor Packet Builder/);
  assert.match(source, /print\/sponsors/);
  assert.match(source, /Print Sponsor Rundown/);
});

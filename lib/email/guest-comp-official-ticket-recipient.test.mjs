import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectReservedSeatRecipientEmail } from "./resolve-reserved-seat-recipient.ts";

const officialTicketUrl = new URL("./official-ticket-email.ts", import.meta.url);
const statusRouteUrl = new URL("../../app/api/admin/shows/[showId]/reserved-seat-email-status/route.ts", import.meta.url);
const panelUrl = new URL("../../app/components/reserved-seating-panel.tsx", import.meta.url);

test("a later Guest/Comp source email resolves while a genuinely missing recipient remains missing", () => {
  assert.equal(selectReservedSeatRecipientEmail({
    reservedSeatEmail: null,
    compTicketEmail: " later-added@example.com ",
    sponsorLibraryEmail: null,
  }), "later-added@example.com");
  assert.equal(selectReservedSeatRecipientEmail({
    reservedSeatEmail: null,
    compTicketEmail: null,
    sponsorLibraryEmail: null,
  }), null);
});

test("Reserved Seating refresh exposes the resolved recipient to existing seat and official-ticket actions", async () => {
  const [statusRoute, panel] = await Promise.all([
    readFile(statusRouteUrl, "utf8"),
    readFile(panelUrl, "utf8"),
  ]);

  assert.match(statusRoute, /resolveReservedSeatRecipientEmail/);
  assert.match(statusRoute, /resolvedRecipientEmail:/);
  assert.match(panel, /const resolvedRecipientEmail = link\.email\?\.trim\(\) \|\| emailStatus\?\.resolvedRecipientEmail\?\.trim\(\) \|\| null/);
  assert.match(panel, /resolvedEmailByLink\.get\(link\.id\)/);
  assert.match(panel, /\{resolvedRecipientEmail \? <p[^>]*>\{resolvedRecipientEmail\}<\/p> : null\}/);
  assert.match(panel, /\{resolvedRecipientEmail \? \([\s\S]*?Send Seat Email/);
  assert.match(panel, /link\.submitted_at && resolvedRecipientEmail/);
  assert.match(panel, /link\.ticket_emailed_at \? "Resend Ticket Email" : "Email Ticket"/);
  assert.doesNotMatch(panel, /link\.submitted_at && link\.email\?\.trim\(\)/);
});

test("official Guest/Comp tickets reuse the resolver while paid reservations retain their stored email path", async () => {
  const source = await readFile(officialTicketUrl, "utf8");
  assert.match(source, /link\.is_complimentary\s*\? await resolveReservedSeatRecipientEmail/);
  assert.match(source, /sourceTicketId: link\.source_ticket_id/);
  assert.match(source, /sourceShowSponsorId: link\.source_show_sponsor_id/);
  assert.match(source, /:\s*link\.email;/);
  assert.match(source, /customerEmail: customerEmail \?\? ""/);
  assert.doesNotMatch(source, /source_ticket_id[\s\S]*?\.update\(\{ email:/);
});

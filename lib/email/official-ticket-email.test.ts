import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const submitRouteUrl = new URL("../../app/api/reserved-seating/submit/route.ts", import.meta.url);
const customerRouteUrl = new URL("../../app/api/reserved-seating/ticket-email/route.ts", import.meta.url);
const adminRouteUrl = new URL("../../app/api/admin/shows/[showId]/reserved-seat-ticket-email/route.ts", import.meta.url);
const customerPageUrl = new URL("../../app/components/reserved-seat-selection-page.tsx", import.meta.url);
const adminPanelUrl = new URL("../../app/components/reserved-seating-panel.tsx", import.meta.url);

const officialEmailUrl = new URL("./official-ticket-email.ts", import.meta.url);

test("official ticket email reuses entry-code rendering and contains ticket details and actions", async () => {
  const source = await readFile(officialEmailUrl, "utf8");
  assert.match(source, /buildTicketCodeSection/);
  assert.match(source, /customerName: input\.customerName/);
  assert.match(source, /eventName/);
  assert.match(source, /showTime/);
  assert.match(source, /venueName/);
  assert.match(source, /seatLabels\.join\(/);
  assert.match(source, /ticketCodeFormat: input\.ticketCodeFormat/);
  assert.match(source, /Phone-Friendly Ticket/);
  assert.match(source, /View Standard Ticket/);
  assert.match(source, /Print Ticket<\/a>/);
  assert.match(source, /Most guests simply use their phone at the door\./);
  assert.match(source, /quickest entry/);
  assert.match(source, /\?phone=1/);
  const phoneButtonIndex = source.indexOf("&#128241; Phone-Friendly Ticket");
  const printButtonIndex = source.indexOf("&#128424;&#65039; Print Ticket");
  const standardButtonIndex = source.indexOf("&#127760; View Standard Ticket");
  assert.ok(phoneButtonIndex >= 0 && phoneButtonIndex < printButtonIndex);
  assert.ok(printButtonIndex < standardButtonIndex);
  assert.match(source, /\?print=1/);
  assert.match(source, /Present this QR code or barcode on your phone/);
});
test("automatic delivery is attempted only after reservation commit and cannot turn success into failure", async () => {
  const source = await readFile(submitRouteUrl, "utf8");
  const commitIndex = source.indexOf(".update({ submitted_at: submittedAt");
  const commitErrorIndex = source.indexOf("if (updateError)");
  const deliveryIndex = source.indexOf("await deliverOfficialTicketEmail", commitErrorIndex);
  const successIndex = source.indexOf("success: true", deliveryIndex);
  assert.ok(commitIndex >= 0 && commitErrorIndex > commitIndex && deliveryIndex > commitErrorIndex && successIndex > deliveryIndex);
  assert.match(source, /try \{\s*const ticketEmailResult = await deliverOfficialTicketEmail/);
  assert.match(source, /Your seats are confirmed, but we could not deliver/);
});

test("customer and authenticated admin resend call the same helper without regenerating reservation data", async () => {
  const [customerRoute, adminRoute, customerPage, adminPanel] = await Promise.all([
    readFile(customerRouteUrl, "utf8"),
    readFile(adminRouteUrl, "utf8"),
    readFile(customerPageUrl, "utf8"),
    readFile(adminPanelUrl, "utf8"),
  ]);
  assert.match(customerRoute, /CUSTOMER_RESEND_COOLDOWN_MS = 60_000/);
  assert.match(customerRoute, /deliverOfficialTicketEmail\(supabase, link\.id, \{ requestOrigin: request\.nextUrl\.origin \}\)/);
  assert.match(adminRoute, /validateReservedSeatEmailStatusAccess/);
  assert.match(adminRoute, /deliverOfficialTicketEmail\(supabase, reservation\.id, \{ requestOrigin: request\.nextUrl\.origin \}\)/);
  assert.match(customerPage, /Email Ticket Again/);
  assert.match(customerPage, /searchParams\.get\("print"\)/);
  assert.match(adminPanel, /Resend Ticket Email/);
  for (const source of [customerRoute, adminRoute]) {
    assert.doesNotMatch(source, /tryGenerateReservationScanToken|generateReservationScanToken|\.insert\(/);
  }
});

test("successful official ticket delivery records the latest emailed timestamp", async () => {
  const source = await readFile(officialEmailUrl, "utf8");
  const successIndex = source.indexOf("if (result.success)");
  const trackingIndex = source.indexOf("await recordOfficialTicketEmailSuccess(supabase, link.id)", successIndex);
  const logIndex = source.indexOf('console.info("Official ticket email sent."', trackingIndex);

  assert.ok(successIndex >= 0 && trackingIndex > successIndex && logIndex > trackingIndex);
  assert.match(source, /update\(\{ ticket_emailed_at: emailedAt \}\)/);
});

test("timestamp tracking failure is logged without changing successful email delivery", async () => {
  const source = await readFile(officialEmailUrl, "utf8");
  const trackingErrorBlock = source.slice(
    source.indexOf('console.error("Official ticket email delivery timestamp tracking failed."'),
    source.indexOf('console.info("Official ticket email sent."', source.indexOf('console.error("Official ticket email delivery timestamp tracking failed."')),
  );

  assert.match(trackingErrorBlock, /reservationId: link\.id/);
  assert.match(trackingErrorBlock, /error:/);
  assert.doesNotMatch(trackingErrorBlock, /throw|return/);
  assert.match(source, /return \{ \.\.\.result, reservationId: link\.id \}/);
});

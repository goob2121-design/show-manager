import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const officialEmailUrl = new URL("./official-ticket-email.ts", import.meta.url);
const reservedEmailUrl = new URL("./reserved-seat-email.ts", import.meta.url);
const attachmentHelperUrl = new URL("./ticket-code-attachments.ts", import.meta.url);
const submitRouteUrl = new URL("../../app/api/reserved-seating/submit/route.ts", import.meta.url);
const customerResendUrl = new URL("../../app/api/reserved-seating/ticket-email/route.ts", import.meta.url);
const adminResendUrl = new URL("../../app/api/admin/shows/[showId]/reserved-seat-ticket-email/route.ts", import.meta.url);

test("both email types use the shared CID PNG source and attachment helper", async () => {
  const [official, reserved, helper] = await Promise.all([
    readFile(officialEmailUrl, "utf8"),
    readFile(reservedEmailUrl, "utf8"),
    readFile(attachmentHelperUrl, "utf8"),
  ]);

  for (const source of [official, reserved]) {
    assert.match(source, /buildTicketCodeEmailAssets/);
    assert.match(source, /getTicketCodeEmailImageSources/);
    assert.doesNotMatch(source, /https?:\/\/[^"'`]*ticket-(?:qr|barcode)/);
  }
  assert.match(reserved, /\.\.\.\(ticketCodeAssets\?\.attachments \?\? \[\]\)/);
  assert.match(official, /\.\.\.ticketCodeAssets\.attachments/);
  assert.match(helper, /TICKET_QR_CONTENT_ID = "ticket-qr"/);
  assert.match(helper, /TICKET_BARCODE_CONTENT_ID = "ticket-barcode"/);
  assert.match(helper, /contentType: "image\/png"/);
});

test("shared format rules create only the requested attachment types", async () => {
  const source = await readFile(attachmentHelperUrl, "utf8");

  assert.match(source, /format === "qr" \|\| format === "both"/);
  assert.match(source, /format === "code128" \|\| format === "both"/);
  assert.match(source, /filename: "ticket-qr\.png"/);
  assert.match(source, /filename: "ticket-barcode\.png"/);
});

test("shared email wording explains one code per reservation with singular and plural grammar", async () => {
  const source = await readFile(reservedEmailUrl, "utf8");

  assert.match(source, /One code covers the ticket in this reservation\./);
  assert.match(source, /One code covers all \$\{ticketCount\} tickets in this reservation\./);
  assert.match(source, /Present this code once at the door\. It will check in all tickets included in this reservation\./);
  assert.match(source, /Tickets in this reservation:/);
  assert.match(source, /You still need to choose your reserved/);
  assert.match(source, /assignedSeatLabels/);
});

test("automatic delivery and both resend routes still use the one official delivery helper", async () => {
  const [submit, customer, admin] = await Promise.all([
    readFile(submitRouteUrl, "utf8"),
    readFile(customerResendUrl, "utf8"),
    readFile(adminResendUrl, "utf8"),
  ]);

  for (const source of [submit, customer, admin]) {
    assert.match(source, /deliverOfficialTicketEmail/);
  }
});

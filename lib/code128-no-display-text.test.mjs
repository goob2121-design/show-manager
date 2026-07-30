import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateCode128, generateQRCode } from "./reservation-scan-tokens.ts";

const browserComponentUrl = new URL("../app/components/reservation-ticket-code.tsx", import.meta.url);
const emailRendererUrl = new URL("./email/reserved-seat-email.ts", import.meta.url);
const emailAttachmentUrl = new URL("./email/ticket-code-attachments.ts", import.meta.url);
const printPageUrl = new URL("../app/admin/[slug]/print/[kind]/page.tsx", import.meta.url);

test("Code128 SVG contains bars without a human-readable text element", () => {
  const token = "stf_A8D23F7C19B84E2A";
  const barcode = generateCode128(token);

  assert.equal(barcode.token, token);
  assert.match(barcode.svg, /<rect\b/);
  assert.doesNotMatch(barcode.svg, /<text\b/);
  assert.doesNotMatch(barcode.svg, />stf_A8D23F7C19B84E2A<\/text>/);
});

test("QR generation remains on its existing SVG and data-URI path", () => {
  const token = "stf_A8D23F7C19B84E2A";
  const qr = generateQRCode(token);

  assert.equal(qr.token, token);
  assert.match(qr.svg, /StageFlow QR code/);
  assert.match(qr.dataUri, /^data:image\/svg\+xml;utf8,/);
});

test("email, browser, and print barcode presentations have no Ticket Code caption", async () => {
  const [browser, email, attachments, printPage] = await Promise.all([
    readFile(browserComponentUrl, "utf8"),
    readFile(emailRendererUrl, "utf8"),
    readFile(emailAttachmentUrl, "utf8"),
    readFile(printPageUrl, "utf8"),
  ]);

  assert.doesNotMatch(browser, /Ticket Code:/);
  assert.doesNotMatch(email, /Ticket Code:/);
  assert.match(attachments, /generateCode128\(token\)\.svg/);
  assert.match(printPage, /ReservationTicketCode/);
});

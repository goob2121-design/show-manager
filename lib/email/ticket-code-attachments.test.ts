import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const attachmentHelperUrl = new URL("./ticket-code-attachments.ts", import.meta.url);
const officialEmailUrl = new URL("./official-ticket-email.ts", import.meta.url);
const sharedEmailUrl = new URL("./reserved-seat-email.ts", import.meta.url);
const browserTicketUrl = new URL("../../app/components/reservation-ticket-code.tsx", import.meta.url);

test("ticket email helper creates format-specific PNG CID attachments", async () => {
  const source = await readFile(attachmentHelperUrl, "utf8");

  assert.match(source, /format === "qr" \|\| format === "both"/);
  assert.match(source, /filename: "ticket-qr\.png"/);
  assert.match(source, /contentType: "image\/png"/);
  assert.match(source, /contentId: TICKET_QR_CONTENT_ID/);
  assert.match(source, /format === "code128" \|\| format === "both"/);
  assert.match(source, /filename: "ticket-barcode\.png"/);
  assert.match(source, /contentId: TICKET_BARCODE_CONTENT_ID/);
  assert.match(source, /rasterizeSvg\(generateQRCode\(token\)\.svg, 360, 360\)/);
  assert.match(source, /rasterizeSvg\(generateCode128\(token\)\.svg, 900, 240\)/);
});

test("official email references CID images and sends generated attachments", async () => {
  const source = await readFile(officialEmailUrl, "utf8");

  assert.match(source, /getTicketCodeEmailImageSources\(input\.ticketCodeFormat\)/);
  assert.match(source, /await buildTicketCodeEmailAssets\(input\.scanToken, input\.ticketCodeFormat\)/);
  assert.match(source, /\.\.\.ticketCodeAssets\.attachments/);
  assert.doesNotMatch(source, /data:image\/svg\+xml/);
});

test("shared email renderer accepts safe image sources while retaining its existing default path", async () => {
  const source = await readFile(sharedEmailUrl, "utf8");

  assert.match(source, /imageSources\?:/);
  assert.match(source, /imageSources \? imageSources\.qrImageSrc : display\.qrDataUri/);
  assert.match(source, /imageSources \? imageSources\.barcodeImageSrc : display\.code128DataUri/);
});

test("browser ticket rendering remains on the existing data URI display path", async () => {
  const source = await readFile(browserTicketUrl, "utf8");

  assert.match(source, /src=\{display\.qrDataUri\}/);
  assert.match(source, /src=\{display\.code128DataUri\}/);
  assert.doesNotMatch(source, /Ticket Code:/);
  assert.doesNotMatch(source, /cid:ticket-/);
});

test("attachment metadata never includes the scan token", async () => {
  const source = await readFile(attachmentHelperUrl, "utf8");
  const metadataBlocks = source.match(/attachments\.push\(\{[\s\S]*?\}\);/g) ?? [];

  assert.equal(metadataBlocks.length, 2);
  for (const block of metadataBlocks) {
    assert.doesNotMatch(block, /scanToken|token/);
  }
});

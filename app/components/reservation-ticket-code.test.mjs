import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const codeUrl = new URL("./reservation-ticket-code.tsx", import.meta.url);
const customerPageUrl = new URL("./reserved-seat-selection-page.tsx", import.meta.url);
const phoneModeUrl = new URL("./phone-ticket-mode.tsx", import.meta.url);

test("customer entry-code card uses larger QR and Code128 displays", async () => {
  const source = await readFile(codeUrl, "utf8");

  assert.match(source, /max-w-\[220px\]/);
  assert.match(source, /max-w-\[420px\]/);
  assert.match(source, /const codeGridClassName = canEnlarge[\s\S]*?"grid-cols-1 justify-items-center"/);
  assert.doesNotMatch(source, /min-\[1100px\]:grid-cols/);
  assert.match(source, /src=\{display\.qrDataUri\}/);
  assert.match(source, /src=\{display\.code128DataUri\}/);
});

test("QR and barcode independently open an accessible dismissible overlay", async () => {
  const source = await readFile(codeUrl, "utf8");

  assert.match(source, /aria-label="Enlarge reservation QR code"/);
  assert.match(source, /aria-label="Enlarge reservation barcode"/);
  assert.match(source, /kind: "qr"/);
  assert.match(source, /kind: "code128"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.target === event\.currentTarget/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, />\s*Close\s*<\/button>/);
  assert.doesNotMatch(source, /target="_blank"|window\.open/);
});

test("interactive styling remains available to shared consumers but is absent from public seat selection", async () => {
  const [source, page, phone] = await Promise.all([
    readFile(codeUrl, "utf8"),
    readFile(customerPageUrl, "utf8"),
    readFile(phoneModeUrl, "utf8"),
  ]);

  assert.match(source, /canEnlarge = interactive && !phone && !printable/);
  assert.match(source, /canEnlarge \? "text-slate-100"/);
  assert.match(source, /break-words text-base leading-6/);
  assert.doesNotMatch(page, /<ReservationTicketCode[\s\S]*compact[\s\S]*interactive/);
  assert.match(phone, /<ReservationTicketCode[\s\S]*phone/);
  assert.doesNotMatch(phone, /<ReservationTicketCode[\s\S]*interactive/);
});

test("entry-card interactivity does not alter token or code generation", async () => {
  const source = await readFile(codeUrl, "utf8");

  assert.match(source, /buildReservationTicketCodeDisplay\(scanToken, format\)/);
  assert.doesNotMatch(source, /generateQRCode|generateCode128|generateReservationScanToken|tryGenerateReservationScanToken/);
});
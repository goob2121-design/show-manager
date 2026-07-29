import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildReservationTicketCodeDisplay } from "./reservation-ticket-code-display";

test("QR output encodes the complete supplied scan token", () => {
  const token = "stf_A8D23F7C19B84E2A";
  const display = buildReservationTicketCodeDisplay(token, "qr");
  assert.ok(display?.qrDataUri);
  assert.equal(display?.code128DataUri, null);
  assert.match(decodeURIComponent(display!.qrDataUri!), new RegExp(token));
});

test("Code 128 output encodes the complete supplied scan token", () => {
  const token = "stf_A8D23F7C19B84E2A";
  const display = buildReservationTicketCodeDisplay(token, "code128");
  assert.equal(display?.qrDataUri, null);
  assert.ok(display?.code128DataUri);
  assert.match(decodeURIComponent(display!.code128DataUri!), new RegExp(token));
});

test("both formats use the same supplied token", () => {
  const token = "stf_A8D23F7C19B84E2A";
  const display = buildReservationTicketCodeDisplay(token, "both");
  assert.ok(display?.qrDataUri);
  assert.ok(display?.code128DataUri);
  assert.match(decodeURIComponent(display!.qrDataUri!), new RegExp(token));
  assert.match(decodeURIComponent(display!.code128DataUri!), new RegExp(token));
});

test("missing scan token returns no ticket-code block", () => {
  assert.equal(buildReservationTicketCodeDisplay(null, "both"), null);
  assert.equal(buildReservationTicketCodeDisplay("", "qr"), null);
});

test("invalid or missing ticket_code_format defaults to QR", () => {
  assert.equal(buildReservationTicketCodeDisplay("stf_A8D23F7C19B84E2A", null)?.format, "qr");
  assert.equal(buildReservationTicketCodeDisplay("stf_A8D23F7C19B84E2A", "something-else")?.format, "qr");
});

test("\"qr\" renders only QR, \"code128\" renders only Code 128, and \"both\" renders both", () => {
  const token = "stf_A8D23F7C19B84E2A";
  const qr = buildReservationTicketCodeDisplay(token, "qr");
  const code128 = buildReservationTicketCodeDisplay(token, "code128");
  const both = buildReservationTicketCodeDisplay(token, "both");

  assert.ok(qr?.qrDataUri);
  assert.equal(qr?.code128DataUri, null);
  assert.equal(code128?.qrDataUri, null);
  assert.ok(code128?.code128DataUri);
  assert.ok(both?.qrDataUri);
  assert.ok(both?.code128DataUri);
});

test("display helper source performs no Supabase access and no token generation", () => {
  const sourcePath = fileURLToPath(new URL("./reservation-ticket-code-display.ts", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /supabase/i);
  assert.doesNotMatch(source, /generateReservationScanToken\(/);
  assert.doesNotMatch(source, /tryGenerateReservationScanToken\(/);
});

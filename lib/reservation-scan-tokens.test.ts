import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PREFERRED_SCAN_FORMAT,
  generateCode128,
  generateQRCode,
  generateReservationScanToken,
  getExistingReservationScanToken,
  getPreferredScanFormat,
  tryGenerateReservationScanToken,
  ScanCodeType,
} from "./reservation-scan-tokens";

test("generateReservationScanToken returns a permanent-looking StageFlow token", () => {
  const token = generateReservationScanToken();
  assert.match(token, /^stf_[0-9A-F]{16}$/);
});

test("generateReservationScanToken returns a URL-safe token", () => {
  const token = generateReservationScanToken();
  assert.match(token, /^[A-Za-z0-9_]+$/);
});

test("repeated generation produces distinct values", () => {
  const first = generateReservationScanToken();
  const second = generateReservationScanToken();
  assert.notEqual(first, second);
});

test("tryGenerateReservationScanToken returns a token during normal operation", () => {
  const token = tryGenerateReservationScanToken();
  assert.ok(token);
  assert.match(token, /^stf_[0-9A-F]{16}$/);
});

test("existing reservations with scan_token = null remain valid", () => {
  assert.equal(getExistingReservationScanToken({ scan_token: null }), null);
  assert.equal(getExistingReservationScanToken({ scanToken: null }), null);
});

test("getExistingReservationScanToken returns an existing token without writes", () => {
  const token = getExistingReservationScanToken({ scan_token: "stf_EXISTING1234ABCD" });
  assert.equal(token, "stf_EXISTING1234ABCD");
});

test("QR and Code128 helpers both preserve the same scan token", () => {
  const token = "stf_A8D23F7C19B84E2A";
  const qr = generateQRCode(token);
  const code128 = generateCode128(token);

  assert.equal(qr.type, ScanCodeType.QR);
  assert.equal(code128.type, ScanCodeType.CODE128);
  assert.equal(qr.token, token);
  assert.equal(code128.token, token);
  assert.match(qr.svg, /^<svg[\s\S]*<\/svg>$/);
  assert.match(code128.svg, /^<svg[\s\S]*<\/svg>$/);
  assert.doesNotMatch(code128.svg, /<text\b/);
  assert.match(code128.svg, /<rect\b/);
  assert.match(qr.dataUri, /^data:image\/svg\+xml;utf8,/);
  assert.match(code128.dataUri, /^data:image\/svg\+xml;utf8,/);
});

test("preferred scan format defaults to QR and does not change the token", () => {
  const previousPublic = process.env.NEXT_PUBLIC_STAGEFLOW_PREFERRED_SCAN_FORMAT;
  const previousServer = process.env.STAGEFLOW_PREFERRED_SCAN_FORMAT;
  delete process.env.NEXT_PUBLIC_STAGEFLOW_PREFERRED_SCAN_FORMAT;
  delete process.env.STAGEFLOW_PREFERRED_SCAN_FORMAT;
  assert.equal(DEFAULT_PREFERRED_SCAN_FORMAT, ScanCodeType.QR);
  assert.equal(getPreferredScanFormat(), ScanCodeType.QR);
  process.env.STAGEFLOW_PREFERRED_SCAN_FORMAT = "CODE128";
  assert.equal(getPreferredScanFormat(), ScanCodeType.CODE128);
  process.env.NEXT_PUBLIC_STAGEFLOW_PREFERRED_SCAN_FORMAT = previousPublic;
  process.env.STAGEFLOW_PREFERRED_SCAN_FORMAT = previousServer;
});

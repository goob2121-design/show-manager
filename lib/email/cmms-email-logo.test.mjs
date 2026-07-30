import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CMMS_EMAIL_LOGO_CONTENT_ID,
  CMMS_EMAIL_LOGO_FILENAME,
  CMMS_EMAIL_LOGO_SRC,
  loadCmmsEmailLogoAsset,
} from "./cmms-email-logo.ts";

const officialEmailUrl = new URL("./official-ticket-email.ts", import.meta.url);
const reservedSeatEmailUrl = new URL("./reserved-seat-email.ts", import.meta.url);

test("loads the shared CMMS PNG with stable, non-reservation attachment metadata", async () => {
  const asset = await loadCmmsEmailLogoAsset();

  assert.ok(asset);
  assert.equal(asset.src, "cid:cmms-logo");
  assert.equal(asset.attachment.filename, "cmms-logo.png");
  assert.equal(asset.attachment.contentType, "image/png");
  assert.equal(asset.attachment.contentId, "cmms-logo");
  assert.deepEqual([...asset.attachment.content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(CMMS_EMAIL_LOGO_CONTENT_ID, "cmms-logo");
  assert.equal(CMMS_EMAIL_LOGO_FILENAME, "cmms-logo.png");
  assert.equal(CMMS_EMAIL_LOGO_SRC, "cid:cmms-logo");
});

test("logo-loading failure returns null for a text-only header instead of failing delivery", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...values) => warnings.push(values);
  try {
    const asset = await loadCmmsEmailLogoAsset(async () => {
      const error = new Error("test failure");
      error.code = "ENOENT";
      throw error;
    });
    assert.equal(asset, null);
    assert.equal(warnings.length, 1);
    assert.deepEqual(warnings[0][1], { category: "ENOENT" });
  } finally {
    console.warn = originalWarn;
  }
});

test("both email transports use the shared CID logo and preserve ticket attachments", async () => {
  const [official, reserved] = await Promise.all([
    readFile(officialEmailUrl, "utf8"),
    readFile(reservedSeatEmailUrl, "utf8"),
  ]);

  for (const source of [official, reserved]) {
    assert.match(source, /loadCmmsEmailLogoAsset/);
    assert.match(source, /CMMS_EMAIL_LOGO_SRC/);
    assert.doesNotMatch(source, /safe\.logoUrl|input\.logoUrl/);
  }
  assert.match(official, /\[logoAsset\.attachment, \.\.\.ticketCodeAssets\.attachments\]/);
  assert.match(official, /: ticketCodeAssets\.attachments/);
  assert.match(reserved, /\.\.\.\(logoAsset \? \[logoAsset\.attachment\] : \[\]\)/);
  assert.match(reserved, /\.\.\.\(ticketCodeAssets\?\.attachments \?\? \[\]\)/);
});

test("both email HTML builders use CID or text fallback headers without an external logo URL", async () => {
  const [official, reserved] = await Promise.all([
    readFile(officialEmailUrl, "utf8"),
    readFile(reservedSeatEmailUrl, "utf8"),
  ]);

  for (const source of [official, reserved]) {
    assert.match(source, /logoSrc \? `<img src="\$\{escapeHtml\(logoSrc\)\}"/);
    assert.match(source, /The Cumberland Mountain Music Show<\/div>/);
    assert.doesNotMatch(source, /cmms-logo\.png/);
  }
});

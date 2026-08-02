import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { SponsorLibraryEntry } from "./types";
// @ts-expect-error Node type-stripping tests require the TypeScript extension.
import { buildCmmsReturnAddressLabels, buildSponsorMailingLabelPrintHtml, CMMS_MAILING_LABEL_LOGO_PATH, CMMS_RETURN_ADDRESS_LINES, formatSponsorMailingLabel, selectBulkSponsorMailingLabels } from "./sponsor-mailing-labels.ts";

function sponsor(overrides: Partial<SponsorLibraryEntry> = {}): SponsorLibraryEntry {
  return {
    id: "sponsor-1",
    name: "Library Sponsor",
    short_message: null,
    full_message: null,
    website: null,
    logo_url: null,
    sponsor_type: null,
    default_contribution: null,
    estimated_value: null,
    recognition_notes: null,
    is_archived: false,
    sponsorship_level: null,
    sponsorship_amount: null,
    payment_status: null,
    proposal_generated_at: null,
    quote_generated_at: null,
    receipt_generated_at: null,
    address_line_1: "100 Main Street",
    address_line_2: null,
    city: "Cumberland Gap",
    state: "TN",
    postal_code: "37724",
    legal_name: "Library Sponsor LLC",
    recognition_name: "Public Sponsor",
    contact_person: null,
    created_at: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

test("mailing label recipient uses recognition, sponsor, then legal name", () => {
  assert.equal(formatSponsorMailingLabel(sponsor())?.lines[0], "Public Sponsor");
  assert.equal(formatSponsorMailingLabel(sponsor({ recognition_name: null }))?.lines[0], "Library Sponsor");
  assert.equal(formatSponsorMailingLabel(sponsor({ recognition_name: null, name: "", legal_name: "Legal Name LLC" }))?.lines[0], "Legal Name LLC");
});

test("mailing label includes Attn and omits a blank address line 2", () => {
  const label = formatSponsorMailingLabel(sponsor({ contact_person: "Jamie Smith", address_line_2: "  " }));
  assert.deepEqual(label?.lines, [
    "Public Sponsor",
    "Attn: Jamie Smith",
    "100 Main Street",
    "Cumberland Gap, TN 37724",
  ]);
});

test("bulk labels exclude incomplete and archived sponsors and include each complete sponsor once", () => {
  const complete = sponsor();
  const incomplete = sponsor({ id: "sponsor-2", name: "Incomplete", address_line_1: null });
  const archived = sponsor({ id: "sponsor-3", name: "Archived", is_archived: true });
  const selection = selectBulkSponsorMailingLabels([complete, incomplete, archived]);
  assert.deepEqual(selection.included.map((label) => label.sponsorId), ["sponsor-1"]);
  assert.deepEqual(selection.excludedIncomplete.map((item) => item.id), ["sponsor-2"]);
  assert.deepEqual(selection.excludedArchived.map((item) => item.id), ["sponsor-3"]);
});

test("print HTML uses a three-column cut-apart sheet", () => {
  const label = formatSponsorMailingLabel(sponsor());
  assert.ok(label);
  const html = buildSponsorMailingLabelPrintHtml([label]);
  assert.match(html, /grid-template-columns: repeat\(3, 2\.5in\)/);
  assert.match(html, /grid-template-rows: repeat\(5, 1\.9in\)/);
  assert.match(html, /@page \{ size: letter portrait/);
  assert.match(html, /margin: \.5in \.35in/);
  assert.match(html, /width: 7\.8in/);
  assert.match(html, /column-gap: \.15in/);
  assert.doesNotMatch(html, /transform:|scale\(|zoom:/);
  assert.match(html, /break-inside: avoid/);
});

test("print typography emphasizes sponsor names and preserves the Attn line", () => {
  const label = formatSponsorMailingLabel(sponsor({ contact_person: "Jamie Smith" }));
  assert.ok(label);
  const html = buildSponsorMailingLabelPrintHtml([label]);
  assert.match(html, /class="sponsor-name">Public Sponsor/);
  assert.match(html, /class="attention-line">Attn: Jamie Smith/);
  assert.match(html, /\.sponsor-name \{[^}]*font-size: 12\.5pt;[^}]*font-weight: 700/);
  assert.match(html, /\.attention-line \{[^}]*font-size: 10\.5pt;[^}]*font-weight: 600/);
  assert.match(html, /font-family: "Segoe UI", Arial, Helvetica, sans-serif/);
  assert.match(html, /\.sponsor-name \{[^}]*line-height: 1\.18;[^}]*white-space: normal/);
  assert.match(html, /\.attention-line \{[^}]*line-height: 1\.18;[^}]*white-space: normal/);
  assert.doesNotMatch(html, /\.sponsor-name \{[^}]*overflow: hidden|\.attention-line \{[^}]*overflow: hidden/);
});

test("CMMS typography and logo layout stay print-safe and undecorated", () => {
  const labels = buildCmmsReturnAddressLabels(1);
  const html = buildSponsorMailingLabelPrintHtml(labels, { logoUrl: CMMS_MAILING_LABEL_LOGO_PATH });
  assert.match(html, /class="cmms-name">Cumberland Mountain Music/);
  assert.match(html, /\.cmms-name \{[^}]*font-size: 10\.5pt;[^}]*font-weight: 700/);
  assert.match(html, /\.cmms-name \{[^}]*white-space: normal;[^}]*overflow-wrap: break-word/);
  assert.match(html, /\.mailing-label-content\.with-logo \{ flex-direction: row; align-items: center; gap: \.12in/);
  assert.match(html, /max-width: \.75in/);
  assert.match(html, /padding: \.14in \.18in/);
  assert.doesNotMatch(html, /padding-right:/);
  assert.match(html, /width: auto; height: auto/);
  assert.match(html, /object-fit: contain/);
  assert.match(html, /background: #fff !important; color: #000 !important/);
  assert.match(html, /border: \.5pt dashed #a8a29e/);
  assert.doesNotMatch(html, /gradient|qr-code|barcode/);
});
test("CMMS return labels use the exact fixed address in one-label and full-sheet modes", () => {
  assert.deepEqual(CMMS_RETURN_ADDRESS_LINES, [
    "Cumberland Mountain Music",
    "319 Cowan Lane",
    "LaFollette, TN 37766",
  ]);
  const oneLabel = buildCmmsReturnAddressLabels(1);
  const fullSheet = buildCmmsReturnAddressLabels(15);
  assert.equal(oneLabel.length, 1);
  assert.equal(fullSheet.length, 15);
  assert.ok(fullSheet.every((label) => JSON.stringify(label.lines) === JSON.stringify(CMMS_RETURN_ADDRESS_LINES)));
  assert.doesNotMatch(JSON.stringify(fullSheet), /Library Sponsor|Public Sponsor|Attn:/);
});

test("CMMS return labels default to text-only and optional logo mode preserves aspect ratio", async () => {
  const labels = buildCmmsReturnAddressLabels(1);
  const textOnlyHtml = buildSponsorMailingLabelPrintHtml(labels, { title: "CMMS Return Address Label" });
  assert.doesNotMatch(textOnlyHtml, /<img/);
  const logoHtml = buildSponsorMailingLabelPrintHtml(labels, { logoUrl: CMMS_MAILING_LABEL_LOGO_PATH });
  assert.equal(CMMS_MAILING_LABEL_LOGO_PATH, "/cmms-logo.png");
  assert.match(logoHtml, /src="\/cmms-logo\.png"/);
  assert.match(logoHtml, /width: auto; height: auto/);
  assert.match(logoHtml, /object-fit: contain/);

  const actionsPath = new URL("../app/components/sponsor-mailing-label-actions.tsx", import.meta.url);
  const actionsSource = await readFile(actionsPath, "utf8");
  assert.match(actionsSource, /const \[includeLogo, setIncludeLogo\] = useState\(false\)/);
  assert.match(actionsSource, /printReturnLabels\(1\)/);
  assert.match(actionsSource, /printReturnLabels\(15\)/);
});
test("admin actions preserve individual targeting and existing Sponsor Library saves", async () => {
  const actionsPath = new URL("../app/components/sponsor-mailing-label-actions.tsx", import.meta.url);
  const showPagePath = new URL("../app/components/show-page.tsx", import.meta.url);
  const [actionsSource, showSource] = await Promise.all([
    readFile(actionsPath, "utf8"),
    readFile(showPagePath, "utf8"),
  ]);
  assert.match(actionsSource, /openMailingLabelPrintWindow\(\[label\]\)/);
  assert.match(showSource, /<SponsorMailingLabelButton sponsor=\{sponsor\} \/>/);
  assert.match(showSource, /<SponsorMailingLabelBulkAction sponsors=\{sponsorLibrary\} \/>/);
  assert.match(showSource, /onSubmit=\{handleCreateSponsorLibraryEntry\}/);
  assert.match(showSource, /handleSaveSponsorLibraryEntry\(sponsor\.id\)/);
});
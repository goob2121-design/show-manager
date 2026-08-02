import type { SponsorLibraryEntry } from "./types.ts";

export type SponsorMailingLabel = {
  kind: "sponsor" | "cmms";
  sponsorId: string;
  sponsorName: string;
  lines: string[];
};

export const CMMS_RETURN_ADDRESS_LINES = [
  "Cumberland Mountain Music",
  "319 Cowan Lane",
  "LaFollette, TN 37766",
] as const;
export const CMMS_MAILING_LABEL_LOGO_PATH = "/cmms-logo.png";

export type SponsorMailingLabelSelection = {
  included: SponsorMailingLabel[];
  excludedIncomplete: SponsorLibraryEntry[];
  excludedArchived: SponsorLibraryEntry[];
};

type SponsorAddress = Pick<
  SponsorLibraryEntry,
  | "id"
  | "name"
  | "recognition_name"
  | "legal_name"
  | "contact_person"
  | "address_line_1"
  | "address_line_2"
  | "city"
  | "state"
  | "postal_code"
  | "is_archived"
>;

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function hasUsableSponsorMailingAddress(sponsor: SponsorAddress) {
  return Boolean(
    clean(sponsor.address_line_1) &&
    clean(sponsor.city) &&
    clean(sponsor.state) &&
    clean(sponsor.postal_code),
  );
}

export function formatSponsorMailingLabel(sponsor: SponsorAddress): SponsorMailingLabel | null {
  if (!hasUsableSponsorMailingAddress(sponsor)) return null;

  const recipientName = clean(sponsor.recognition_name) || clean(sponsor.name) || clean(sponsor.legal_name) || "Sponsor";
  const contactPerson = clean(sponsor.contact_person);
  const addressLine2 = clean(sponsor.address_line_2);
  const cityStatePostal = `${clean(sponsor.city)}, ${clean(sponsor.state)} ${clean(sponsor.postal_code)}`;

  return {
    kind: "sponsor",
    sponsorId: sponsor.id,
    sponsorName: recipientName,
    lines: [
      recipientName,
      contactPerson ? `Attn: ${contactPerson}` : "",
      clean(sponsor.address_line_1),
      addressLine2,
      cityStatePostal,
    ].filter(Boolean),
  };
}

export function selectBulkSponsorMailingLabels(
  sponsors: SponsorLibraryEntry[],
): SponsorMailingLabelSelection {
  const included: SponsorMailingLabel[] = [];
  const excludedIncomplete: SponsorLibraryEntry[] = [];
  const excludedArchived: SponsorLibraryEntry[] = [];

  sponsors.forEach((sponsor) => {
    if (sponsor.is_archived) {
      excludedArchived.push(sponsor);
      return;
    }

    const label = formatSponsorMailingLabel(sponsor);
    if (label) included.push(label);
    else excludedIncomplete.push(sponsor);
  });

  return { included, excludedIncomplete, excludedArchived };
}

export function buildCmmsReturnAddressLabels(count: 1 | 15): SponsorMailingLabel[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: "cmms",
    sponsorId: `cmms-return-${index + 1}`,
    sponsorName: CMMS_RETURN_ADDRESS_LINES[0],
    lines: [...CMMS_RETURN_ADDRESS_LINES],
  }));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function chunkLabels(labels: SponsorMailingLabel[], size = 15) {
  const pages: SponsorMailingLabel[][] = [];
  for (let index = 0; index < labels.length; index += size) {
    pages.push(labels.slice(index, index + size));
  }
  return pages;
}

export function buildSponsorMailingLabelPrintHtml(
  labels: SponsorMailingLabel[],
  options: { title?: string; logoUrl?: string } = {},
) {
  const pages = chunkLabels(labels);
  const logoMarkup = options.logoUrl
    ? `<img class="mailing-label-logo" src="${escapeHtml(options.logoUrl)}" alt="" />`
    : "";
  const pageMarkup = pages.map((page) => `<section class="label-sheet">${page.map((label) => {
    const lineMarkup = label.lines.map((line, index) => {
      const lineClass = index === 0
        ? label.kind === "cmms" ? "cmms-name" : "sponsor-name"
        : label.kind === "sponsor" && line.startsWith("Attn:") ? "attention-line" : "address-line";
      return `<div class="${lineClass}">${escapeHtml(line)}</div>`;
    }).join("");
    return `<div class="mailing-label ${label.kind}-label"><div class="mailing-label-content${options.logoUrl && label.kind === "cmms" ? " with-logo" : ""}">${options.logoUrl && label.kind === "cmms" ? logoMarkup : ""}<div class="mailing-label-text">${lineMarkup}</div></div></div>`;
  }).join("")}</section>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(options.title ?? "Sponsor Mailing Labels")}</title><style>
    @page { size: letter portrait; margin: .5in .35in; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: "Segoe UI", Arial, Helvetica, sans-serif; }
    .label-sheet { width: 7.8in; height: 10in; display: grid; grid-template-columns: repeat(3, 2.5in); grid-template-rows: repeat(5, 1.9in); column-gap: .15in; row-gap: .125in; break-after: page; page-break-after: always; }
    .label-sheet:last-child { break-after: auto; page-break-after: auto; }
    .mailing-label { width: 2.5in; height: 1.9in; display: flex; align-items: center; overflow: hidden; padding: .14in .18in; border: .5pt dashed #a8a29e; break-inside: avoid; page-break-inside: avoid; background: #fff; color: #000; }
    .mailing-label-content { width: 100%; display: flex; flex-direction: column; justify-content: center; }
    .mailing-label-content.with-logo { flex-direction: row; align-items: center; gap: .12in; }
    .mailing-label-logo { display: block; width: auto; height: auto; max-width: .75in; max-height: .72in; flex: 0 0 auto; object-fit: contain; }
    .mailing-label-text { min-width: 0; }
    .sponsor-name { margin: 0 0 .025in; font-size: 12.5pt; font-weight: 700; line-height: 1.18; white-space: normal; overflow-wrap: break-word; }
    .attention-line { margin: 0 0 .018in; font-size: 10.5pt; font-weight: 600; line-height: 1.18; white-space: normal; overflow-wrap: break-word; }
    .sponsor-label .address-line { font-size: 10.5pt; font-weight: 400; line-height: 1.2; white-space: normal; overflow-wrap: break-word; }
    .cmms-name { margin: 0 0 .025in; font-size: 10.5pt; font-weight: 700; line-height: 1.15; white-space: normal; overflow-wrap: break-word; }
    .cmms-label .address-line { font-size: 10pt; font-weight: 400; line-height: 1.18; white-space: nowrap; }
    @media print { html, body { width: 8.5in; } html, body, .mailing-label { background: #fff !important; color: #000 !important; } }
  </style></head><body>${pageMarkup}</body></html>`;
}

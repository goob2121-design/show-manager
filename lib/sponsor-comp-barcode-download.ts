export function sponsorCompBarcodeFilename(sponsorName: string, ordinal: number) {
  const safeName = sponsorName
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "Sponsor";
  return `${safeName}-Ticket-${String(Math.max(1, ordinal)).padStart(2, "0")}.png`;
}

export function sponsorCompBarcodeZipFilename(sponsorName: string) {
  const ticketFilename = sponsorCompBarcodeFilename(sponsorName, 1);
  return `${ticketFilename.replace(/-Ticket-01\.png$/, "")}-Barcodes.zip`;
}
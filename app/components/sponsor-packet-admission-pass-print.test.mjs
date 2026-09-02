import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const builderUrl = new URL("./sponsor-packet-builder.tsx", import.meta.url);

test("Sponsor Packet admission pass is constrained to one printable Letter page", async () => {
  const source = await readFile(builderUrl, "utf8");
  assert.match(source, /@page \{ size: letter; margin: 0\.65in; \}/);
  assert.match(source, /\.packet-admission-pass-page \{[\s\S]*?box-sizing: border-box !important;[\s\S]*?width: 7\.2in !important;[\s\S]*?height: 9\.7in !important;[\s\S]*?max-height: 9\.7in !important;[\s\S]*?break-inside: avoid !important;[\s\S]*?page-break-inside: avoid !important;/);
  assert.match(source, /\.packet-page \{[\s\S]*?break-after: page; page-break-after: always;/);
  assert.match(source, /packet-admission-pass-page[\s\S]*?packet-seat-location-page/);
});

test("admission pass keeps required content and scan-safe code sizing", async () => {
  const source = await readFile(builderUrl, "utf8");
  const ticketCode = await readFile(new URL("./reservation-ticket-code.tsx", import.meta.url), "utf8");
  for (const content of [
    "OFFICIAL ADMISSION PASS",
    "Present this page at the door",
    "Entry Code:",
    "Ticket holder:",
    "Tickets:",
    "Seats:",
    "Cumberland Mountain Music Show",
  ]) assert.match(`${source}\n${ticketCode}`, new RegExp(content));
  assert.match(source, /img\[alt="Reservation barcode"\][\s\S]*?max-width: 5\.8in !important;[\s\S]*?max-height: 0\.8in !important;/);
  assert.match(source, /<ReservationTicketCode scanToken=\{admissionPass\.scanToken\}/);
  assert.match(source, /sponsorAdmissionSeatSummary\(admissionPass\)/);
});

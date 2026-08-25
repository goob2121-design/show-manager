import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const wrapperUrl = new URL("tickets-check-in-panel.tsx", import.meta.url);
const salesUrl = new URL("ticket-sales-panel.tsx", import.meta.url);
const admissionsUrl = new URL("admissions-sync-preview-panel.tsx", import.meta.url);
const reservedUrl = new URL("reserved-seating-panel.tsx", import.meta.url);
const openReservedUrl = new URL("../reserved-seating-panel.tsx", import.meta.url);
const sponsorCompUrl = new URL("sponsor-comp-panel.tsx", import.meta.url);
const reportsUrl = new URL("ticket-reports-panel.tsx", import.meta.url);
const quickNavUrl = new URL("../admin-quick-nav.tsx", import.meta.url);

test("Tickets and Check-In actions share one responsive grid", async () => {
  const [wrapper, sales, admissions, quickNav] = await Promise.all([
    readFile(wrapperUrl, "utf8"),
    readFile(salesUrl, "utf8"),
    readFile(admissionsUrl, "utf8"),
    readFile(quickNavUrl, "utf8"),
  ]);

  assert.doesNotMatch(wrapper, /Print Studio|Square Integration|Summary \/ Totals/);
  assert.match(quickNav, /label: "Print Studio", href: "\/print-studio"/);
  assert.equal((sales.match(/Square Integration/g) ?? []).length, 1);
  assert.match(sales, /encodeURIComponent\(showSlug\).*square-integration/s);
  assert.match(sales, /onClick=\{onToggleManualTicketForm\}/);
  assert.match(sales, /onClick=\{onToggleTotals\}/);
  assert.match(admissions, /grid gap-3 sm:grid-cols-2 xl:grid-cols-4/);

  const order = ["Add Manual / Complimentary Ticket", "Open Door Mode / Door Check-In", "Square Integration", "Show Totals"]
    .map((label) => sales.indexOf(label));
  assert.ok(order.every((position) => position >= 0));
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  assert.ok(admissions.indexOf("{headerActions}") < admissions.indexOf("Preview Check-In List"));
  for (const title of ["Ticket Sales & Check-In", "Reserved Seating", "Sponsor & Comp Tickets", "Reports & Printouts"]) {
    assert.match(wrapper, new RegExp(`title: "${title.replace(/[&/]/g, "\\$&")}"`));
  }
  for (const key of ["ticket-sales", "reserved-seating", "sponsor-comp", "reports"]) {
    assert.match(wrapper, new RegExp(`key: "${key}"`));
  }
  assert.match(wrapper, /onClick=\{\(\) => onSectionSelect\(section\.key\)\}/);
  assert.match(wrapper, /min-h-20 rounded-xl border px-4 py-3/);
});

test("selected ticket workspaces begin with actions without repeating navigation labels", async () => {
  const [sales, reserved, openReserved, sponsorComp, reports] = await Promise.all([
    readFile(salesUrl, "utf8"),
    readFile(reservedUrl, "utf8"),
    readFile(openReservedUrl, "utf8"),
    readFile(sponsorCompUrl, "utf8"),
    readFile(reportsUrl, "utf8"),
  ]);

  assert.doesNotMatch(sales, /<h3[^>]*>Ticket Sales &amp; Check-In<\/h3>/);
  assert.ok(sales.indexOf("<AdmissionsSyncPreviewPanel") >= 0);
  assert.match(sales, /Add Manual \/ Complimentary Ticket/);
  assert.match(sales, /Open Door Mode \/ Door Check-In/);

  assert.doesNotMatch(reserved, /<h3[^>]*>Reserved Seating<\/h3>/);
  assert.match(reserved, /onClick=\{onToggleReservedSeating\}/);
  assert.doesNotMatch(openReserved, /<h3[^>]*>Reserved Seating<\/h3>/);
  assert.match(openReserved, /aria-label="Reserved Seating actions"/);
  assert.match(openReserved, /Reserved Seating Status/);
  assert.match(openReserved, /Venue Seat Map/);

  assert.doesNotMatch(sponsorComp, /<h3[^>]*>Sponsor & Comp Tickets<\/h3>/);
  assert.match(sponsorComp, /All Sponsor & Comp Entries/);
  assert.match(sponsorComp, /Export All to Print Studio/);

  assert.doesNotMatch(reports, /<h3[^>]*>Reports &amp; Printouts<\/h3>/);
  assert.match(reports, /Print Door Count List/);
  assert.match(reports, /Print Comp Reserved Seat Cards/);
});

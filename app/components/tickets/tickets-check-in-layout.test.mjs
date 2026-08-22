import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const wrapperUrl = new URL("tickets-check-in-panel.tsx", import.meta.url);
const salesUrl = new URL("ticket-sales-panel.tsx", import.meta.url);
const admissionsUrl = new URL("admissions-sync-preview-panel.tsx", import.meta.url);
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

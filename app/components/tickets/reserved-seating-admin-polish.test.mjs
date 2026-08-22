import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolsUrl = new URL("reserved-seating-panel.tsx", import.meta.url);
const cardsUrl = new URL("../reserved-seating-panel.tsx", import.meta.url);
const ticketsCheckInUrl = new URL("tickets-check-in-panel.tsx", import.meta.url);

test("Public Availability actions live in the Reserved Seating tools grid without a standalone panel", async () => {
  const source = await readFile(toolsUrl, "utf8");
  assert.match(source, /onClick=\{onOpenPublicSeatAvailabilityPage\}[\s\S]*Open Public Availability/);
  assert.match(source, /onClick=\{onCopyPublicSeatAvailabilityLink\}[\s\S]*Copy Availability Link/);
  assert.doesNotMatch(source, /<h3[^>]*>Public Seat Availability<\/h3>/);
  assert.match(source, /Public availability URL: \{publicSeatAvailabilityUrl\}/);
  assert.match(source, /Generic fallback: \{genericPublicSeatAvailabilityUrl\}/);
  assert.match(source, /flex flex-wrap gap-2 sm:justify-end/);
  assert.match(source, /min-h-10/);
  assert.doesNotMatch(source, /Online orders are automatically added to Reserved Seating/);
});

test("adjacent reservation cards use subtle alternating dark surfaces and stronger spacing", async () => {
  const source = await readFile(cardsUrl, "utf8");
  assert.match(source, /filteredLinksWithSeats\.map\(\(link, index\) =>/);
  assert.match(source, /index % 2 === 0/);
  assert.match(source, /border-white\/20 border-l-slate-500\/60 bg-\[#07111f\]/);

  assert.match(source, /border-white\/25 border-l-slate-400\/70 bg-\[#142238\]/);
  assert.match(source, /className="mt-4 grid gap-5"/);
  assert.match(source, /rounded-2xl border border-l-2 p-4/);
});

test("Reserved Seating status is collapsed by default with live summary and warnings visible", async () => {
  const source = await readFile(cardsUrl, "utf8");
  assert.match(source, /<details className="group mt-3/);
  assert.doesNotMatch(source, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(source, /Reserved Seating Status/);
  assert.match(source, /seatPreferenceCounts\.autoAssignRequested[\s\S]*seatPreferenceCounts\.customerSelecting[\s\S]*seatPreferenceCounts\.seatsAssigned[\s\S]*readinessSummary\.ready\.reservations/);
  assert.match(source, /seatingAttentionCount > 0[\s\S]*need attention/);
  assert.match(source, /aria-label="Reserved seating preference summary"/);
  assert.match(source, /aria-label="Reserved seating readiness summary"/);
  assert.match(source, /group-open:hidden[\s\S]*group-open:inline/);
});

test("open Reserved Seating uses one compact header with all actions and no duplicate Back button", async () => {
  const [wrapper, source] = await Promise.all([readFile(ticketsCheckInUrl, "utf8"), readFile(cardsUrl, "utf8")]);
  assert.match(wrapper, /activeSection === "reserved-seating" && !reservedSeatingPanelProps\.isReservedSeatingOpen/);
  assert.equal((source.match(/<h3[^>]*>Reserved Seating<\/h3>/g) ?? []).length, 1);
  assert.match(source, /Manage reserved seating, assignments, public availability, and seat cards from one place\./);
  assert.match(source, /aria-label="Reserved Seating actions"/);
  assert.match(source, /onClick=\{onToggleReservedSeating\}[\s\S]*Hide Reserved Seating/);
  assert.match(source, /onClick=\{onOpenPublicSeatAvailabilityPage\}[\s\S]*Open Public Availability/);
  assert.match(source, /onClick=\{onCopyPublicSeatAvailabilityLink\}[\s\S]*Copy Availability Link/);
  assert.match(source, /onClick=\{\(\) => setShowBulkReminderConfirmation\(true\)\}/);
  assert.match(source, /disabled=\{bulkReminderEligibleCount === 0 \|\| activeActionId === "bulk-reminders"\}/);
  assert.match(source, /href=\{`\/admin\/\$\{showSlug\}\/print\/seat-map-roster`\}/);
  assert.match(source, /href=\{`\/admin\/\$\{showSlug\}\/print\/selected-seat-cards`\}/);
  assert.doesNotMatch(source, /<AdminBackButton/);
  assert.match(source, /grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6/);
  assert.equal((source.match(/min-h-11 w-full min-w-0/g) ?? []).length, 6);
  assert.match(source, /text-center text-sm font-semibold leading-5/);
  assert.doesNotMatch(source, /whitespace-nowrap/);
  assert.match(source, /`Send Reminders \(\$\{bulkReminderEligibleCount\}\)`/);
  assert.ok(source.indexOf('aria-label="Reserved Seating actions"') < source.indexOf('<details className="group mt-3'));
});

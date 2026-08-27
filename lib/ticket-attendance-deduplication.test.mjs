import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin and Door Mode exclude sponsor projections from totals and check-ins", async () => {
  const [admin, door, helper] = await Promise.all([
    readFile(new URL("../app/components/show-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/door-mode-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("door-mode-presentation.ts", import.meta.url), "utf8"),
  ]);
  assert.match(admin, /expectedDoorAttendance\(compTickets, sponsorCompTicketsAllowed, sponsorReservedProjectionTicketIds\)/);
  assert.match(admin, /filter\(\(item\) => !sponsorReservedProjectionTicketIds\.has\(item\.id\)\)[\s\S]*checked_in_count/);
  assert.match(admin, /\{checkedInCompTickets\} of \{totalCompTickets\}/);
  assert.match(door, /expectedDoorAttendance\(compTickets, sponsorCompTicketsAllowed, sponsorReservedProjectionTicketIds\)/);
  assert.match(door, /filter\(\(item\) => !sponsorReservedProjectionTicketIds\.has\(item\.id\)\)/);
  assert.match(helper, /sponsorProjectionTicketIds\.has\(admission\.id\)/);
});

test("sponsor breakdown cards retain their independent allowance calculations", async () => {
  const admin = await readFile(new URL("../app/components/show-page.tsx", import.meta.url), "utf8");
  assert.match(admin, /Sponsor Comps Included[\s\S]*\{sponsorCompTicketsAllowed\}/);
  assert.match(admin, /Sponsor Comps Checked In[\s\S]*\{sponsorCompTicketsCheckedIn\}/);
  assert.match(admin, /Sponsor Comps Remaining[\s\S]*\{sponsorCompTicketsRemaining\}/);
});

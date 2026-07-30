import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("./page.tsx", import.meta.url);

test("main dashboard links Door Mode to the selected current show", async () => {
  const source = await readFile(dashboardUrl, "utf8");

  assert.match(source, /const currentShow = upcomingShows\[0\] \?\? null/);
  assert.match(source, /href=\{\x60\/admin\/\$\{currentShow\.slug\}\/door\x60\}/);
  assert.match(source, />Door Mode<\/span>/);
  assert.match(source, />Live Ticket Check-In<\/span>/);
  assert.match(source, /aria-label=\{\x60Open Door Mode for \$\{currentShow\.name\}\x60\}/);
});

test("Door Mode remains show-specific and preserves the existing Admin action", async () => {
  const source = await readFile(dashboardUrl, "utf8");

  const currentShowBranch = source.indexOf(") : currentShow ? (");
  const doorModeLink = source.indexOf("href={`/admin/${currentShow.slug}/door`}", currentShowBranch);
  const adminLink = source.indexOf("href={`/admin/${currentShow.slug}`}", doorModeLink);

  assert.ok(currentShowBranch >= 0);
  assert.ok(doorModeLink > currentShowBranch);
  assert.ok(adminLink > doorModeLink);
  assert.match(source, /<AdminGate[\s\S]*?slug="shows-dashboard"/);
});

test("dashboard replaces generic summary cards with current-show operations metrics", async () => {
  const source = await readFile(dashboardUrl, "utf8");

  assert.match(source, /Online Tickets Sold/);
  assert.match(source, /Reserved Seats/);
  assert.match(source, /Sponsor & Comp/);
  assert.match(source, /Show Progress/);
  assert.match(source, /Ticket Sales/);
  assert.match(source, /isCopyLinksExpanded/);
  assert.doesNotMatch(source, /Portal Access/);
  assert.doesNotMatch(source, /Nearby Upcoming Shows/);
  assert.doesNotMatch(source, /Open Admin Portal/);
});

test("dashboard derives scanned current-show metrics from show-scoped ticket and seating sources", async () => {
  const source = await readFile(dashboardUrl, "utf8");

  assert.match(source, /from\("show_comp_tickets"\)[\s\S]*select\("ticket_count, ticket_type"\)[\s\S]*eq\("show_id", nextCurrentShow\.id\)/);
  assert.match(source, /from\("show_reserved_seat_assignments"\)[\s\S]*eq\("assignment_type", "customer"\)/);
  assert.match(source, /from\("show_reserved_seating_links"\)[\s\S]*eq\("show_id", nextCurrentShow\.id\)/);
  assert.match(source, /ticket_type === "paid_online"/);
  assert.match(source, /ticket_type === "complimentary"/);
});

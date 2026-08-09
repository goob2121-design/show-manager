import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  checkInAdmissionLabel,
  checkInTicketDestination,
  // @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "./check-in-ticket-classification.ts";

const source = readFileSync("app/components/door-mode-page.tsx", "utf8").replace(/\r\n/g, "\n");

function sourceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, "Missing source marker: " + start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, "Missing source marker: " + end);
  return source.slice(startIndex, endIndex);
}

test("sponsor comps are excluded from Special Admissions while non-sponsor categories remain", () => {
  const categories = ["guest", "band", "media", "volunteer", "staff", "other"];
  for (const category of categories) {
    const notes = "[Comp Type: " + category + "]";
    assert.equal(checkInTicketDestination("complimentary", notes), "special_admissions");
    assert.notEqual(checkInAdmissionLabel("complimentary", notes).length, 0);
  }

  const filter = sourceBetween(
    "  const compAndOtherTickets = useMemo(",
    "  const filteredPrepaidTickets = useMemo(",
  );
  assert.match(filter, /item\.ticket_type === "complimentary"/);
  assert.match(filter, /sponsorReservedProjectionTicketIds\.has\(item\.id\)/);
});

test("Special Admissions count uses the sponsor-excluded collection", () => {
  assert.match(
    source,
    /const specialAdmissionCount = compAndOtherTickets\.reduce\(\(sum, item\) => sum \+ item\.ticket_count, 0\)/,
  );
});

test("Sponsor Comps remains sourced and rendered separately", () => {
  assert.match(source, /const sponsorsWithCompTickets = useMemo/);
  assert.match(source, /showSponsors\.filter/);
  assert.match(source, /\.from\("show_sponsors"\)/);
  assert.match(source, /Sponsor Comp Tickets/);
  assert.match(source, /sponsorsWithCompTickets\.map\(\(sponsor\)/);
});

test("Special Admissions Check In All sends only the remaining quantity", () => {
  const modal = sourceBetween(
    "        {isSpecialAdmissionsPanelOpen ? (",
    "        {isSponsorCompPanelOpen ? (",
  );
  assert.match(modal, /item\.ticket_count - item\.checked_in_count/);
  assert.equal(4 - 0, 4);
  assert.equal(4 - 1, 3);
  assert.match(
    modal,
    /disabled=\{Boolean\(activeActionId\) \|\| item\.checked_in_count >= item\.ticket_count\}/,
  );
  assert.match(modal, /\+1 Check In/);
  assert.match(modal, /handleAdjustTicketCheckIn\(item, -1\)/);
  assert.match(modal, /item\.checked_in_count <= 0/);
});

test("Sponsor Comps reuses the existing View Seats control for assigned sponsor projections", () => {
  const sponsorModal = sourceBetween(
    "        {isSponsorCompPanelOpen ? (",
    "      {seatView ? (",
  );
  assert.match(sponsorModal, /sponsorReservedProjectionTicketIds\.has\(ticket\.id\)/);
  assert.match(sponsorModal, /renderSeatLocationControl\(sponsorReservedTicket\)/);
});

test("Sponsor Comps Check In All uses only the remainder and preserves custom, undo, and View Seats", () => {
  const sponsorModal = sourceBetween(
    "        {isSponsorCompPanelOpen ? (",
    "      {seatView ? (",
  );
  assert.match(sponsorModal, /const remainingComps = sponsor\.comp_ticket_allowance - sponsor\.comp_tickets_checked_in/);
  assert.match(sponsorModal, /handleAdjustSponsorCompCheckIn\(sponsor, remainingComps\)/);
  assert.equal(4 - 0, 4);
  assert.equal(4 - 1, 3);
  assert.equal(4 - 3, 1);
  assert.match(sponsorModal, /handleAdjustSponsorCompCheckIn\(sponsor, 1\)/);
  assert.match(sponsorModal, /handleCheckInCustomSponsorCompAmount\(sponsor\)/);
  assert.match(sponsorModal, /disabled=\{Boolean\(activeActionId\) \|\| remainingComps <= 0\}/);
  assert.match(sponsorModal, /handleAdjustSponsorCompCheckIn\(sponsor, -1\)/);
  assert.match(sponsorModal, /renderSeatLocationControl\(sponsorReservedTicket\)/);
});

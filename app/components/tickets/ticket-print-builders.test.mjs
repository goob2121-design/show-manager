import assert from "node:assert/strict";
import test from "node:test";
import { createTicketPrintBuilders } from "./ticket-print-builders.ts";

function builders({ legacy = false } = {}) {
  const sponsors = [
    { id: "sponsor-1", comp_ticket_allowance: 2, comp_tickets_checked_in: 0, custom_note: "Peace Keepers Firearms Training", recognition_notes: "[admission type: reserved]" },
    { id: "sponsor-2", comp_ticket_allowance: 1, comp_tickets_checked_in: 0, custom_note: "Second Sponsor", recognition_notes: null },
  ];
  const compTickets = [
    { id: "projection-1", guest_name: "Peace Keepers Firearms Training", ticket_type: "manual", ticket_count: 2, checked_in_count: 0, notes: "Reserved seating comp" },
    { id: "projection-2", guest_name: "Second Sponsor", ticket_type: "manual", ticket_count: 1, checked_in_count: 0, notes: "[comp type: sponsor]" },
    { id: "other-1", guest_name: "Legitimate Other", ticket_type: "manual", ticket_count: 3, checked_in_count: 0, notes: "" },
    { id: "guest-1", guest_name: "Guest Artist", ticket_type: "guest_list", ticket_count: 1, checked_in_count: 0, notes: "[comp type: guest]" },
  ];
  const links = [
    { id: "link-1", source_ticket_id: legacy ? "projection-1" : null, source_show_sponsor_id: legacy ? null : "sponsor-1", customer_name: "Peace Keepers Firearms Training", is_complimentary: true, source_note: legacy ? "Reserved seating comp" : "" },
    { id: "link-2", source_ticket_id: legacy ? "projection-2" : null, source_show_sponsor_id: "sponsor-2", customer_name: "Second Sponsor", is_complimentary: true, source_note: "[comp type: sponsor]" },
  ];
  const assignments = [
    { id: "assignment-1", seating_link_id: "link-1", seat_id: "L-J1", customer_name: "Peace Keepers Firearms Training", seat_category: "comp" },
    { id: "assignment-2", seating_link_id: "link-1", seat_id: "L-J2", customer_name: "Peace Keepers Firearms Training", seat_category: "comp" },
  ];

  return createTicketPrintBuilders({
    show: { name: "CMMS", show_date: "2026-10-03", guest_arrival_time: "6:00 PM", show_start_time: "7:00 PM" },
    sponsorsWithCompTickets: sponsors,
    compTickets,
    sponsorTicketReservedLinks: links,
    sponsorTicketReservedAssignments: assignments,
    sponsorReservedProjectionTicketIds: legacy ? new Set() : new Set(["projection-1", "projection-2"]),
    sponsorTicketSponsorId: "",
    selectedSponsorTicketSeatIds: [],
    activeSponsorTicketTemplateUrl: "sponsor.png",
    activeGeneralTicketTemplateUrl: "general.png",
    activeGeneralAdmissionTicketTemplateUrl: "ga.png",
    generalAdmissionTicketFormState: { quantity: "1", showEvent: "", showDate: "", doorsTime: "", showTime: "", ticketPrefix: "", ticketStartNumber: "1" },
    getSponsorTicketSponsorName: (sponsor) => sponsor.custom_note ?? "Sponsor",
    normalizeGuestListTicketType: (value) => value,
    stripCompMetadataFromNotes: (value) => value ?? "",
    sortReservedSeatIds: (seatIds) => [...seatIds].sort((a, b) => Number(a.match(/\d+$/)?.[0]) - Number(b.match(/\d+$/)?.[0])),
    formatReservedSeatLabel: (seatId) => seatId,
    formatShowDate: (showDate) => showDate ?? "",
    escapeHtml: (value) => String(value ?? ""),
  });
}

test("ticket printing hides linked sponsor projections and keeps canonical sponsor quantities and seats", () => {
  const print = builders();
  const rows = print.buildCompListReportRows();

  assert.deepEqual(rows.filter((row) => row.category === "sponsor").map((row) => [row.name, row.quantity]), [
    ["Peace Keepers Firearms Training", 2],
    ["Second Sponsor", 1],
  ]);
  assert.equal(rows.some((row) => row.id === "comp-projection-1" || row.id === "comp-projection-2"), false);
  assert.equal(rows.find((row) => row.id === "sponsor-sponsor-1")?.reservedSeats, "L-J1, L-J2");
  assert.equal(print.getCompTicketPrintRows("all").reduce((sum, row) => sum + row.quantity, 0), 7);
  assert.equal(print.getCompTicketPrintRows("sponsor").length, 2);
  assert.deepEqual(print.getCompTicketPrintRows("non_sponsor").map((row) => row.name), ["Legitimate Other", "Guest Artist"]);

  const html = print.buildCompTicketPrintHtml({ printMode: "pdf", scope: "row:sponsor-sponsor-1" }) ?? "";
  assert.match(html, /L-J1/);
  assert.match(html, /L-J2/);
});

test("ticket printing cautiously deduplicates an exact-name legacy sponsor projection", () => {
  const rows = builders({ legacy: true }).buildCompListReportRows();
  assert.equal(rows.some((row) => row.id === "comp-projection-1"), false);
  assert.equal(rows.some((row) => row.id === "comp-other-1"), true);
});

test("canonical projection identity does not depend on matching names, seats, or quantities", () => {
  const print = builders();
  const projection = print.buildCompListReportRows().find((row) => row.id === "comp-projection-1");
  assert.equal(projection, undefined);

  const rows = print.buildCompListReportRows();
  assert.equal(rows.filter((row) => row.category === "sponsor").length, 2);
  assert.equal(rows.some((row) => row.id === "comp-other-1"), true);
  assert.equal(rows.some((row) => row.id === "comp-guest-1"), true);
  assert.equal(rows.reduce((sum, row) => sum + row.quantity, 0), 7);
});

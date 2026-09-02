import type { ShowCompTicket, ShowReservedSeatAssignment, ShowReservedSeatingLink, ShowSponsor, SponsorLibraryEntry } from "@/lib/types";

type SponsorWithLibrary = ShowSponsor & { sponsor?: SponsorLibraryEntry | SponsorLibraryEntry[] | null };

export type SponsorAdmissionPass = {
  id: string;
  rowId: string;
  sponsorName: string;
  contactName: string;
  admissionLabel: string;
  quantity: number;
  scanToken: string;
  seats: ShowReservedSeatAssignment[];
  seatingState: "assigned" | "nss" | "pending";
};

function relation<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function clean(value: string | null | undefined) { return value?.trim() ?? ""; }

function sponsorName(sponsor: SponsorWithLibrary | undefined, fallback: string) {
  const library = relation(sponsor?.sponsor);
  return clean(library?.recognition_name) || clean(library?.name) || clean(library?.legal_name) || fallback;
}

export function sortSponsorAdmissionSeats(seats: ShowReservedSeatAssignment[]) {
  return [...seats].sort((left, right) => {
    const section = left.section.localeCompare(right.section, "en-US");
    if (section) return section;
    const row = left.row_label.localeCompare(right.row_label, "en-US");
    return row || left.seat_number - right.seat_number;
  });
}

export function buildSponsorAdmissionPasses(input: {
  sponsors: SponsorWithLibrary[];
  compTickets: ShowCompTicket[];
  links: ShowReservedSeatingLink[];
  assignments: ShowReservedSeatAssignment[];
}) {
  const sponsorById = new Map(input.sponsors.map((item) => [item.id, item]));
  const compById = new Map(input.compTickets.map((item) => [item.id, item]));
  const assignmentsByLink = new Map<string, ShowReservedSeatAssignment[]>();
  for (const assignment of input.assignments) {
    if (!assignment.seating_link_id || assignment.assignment_type !== "customer") continue;
    const current = assignmentsByLink.get(assignment.seating_link_id) ?? [];
    current.push(assignment); assignmentsByLink.set(assignment.seating_link_id, current);
  }
  const passes: SponsorAdmissionPass[] = [];
  const unavailable: Array<{ rowId: string; reason: string }> = [];
  for (const link of input.links) {
    if (!link.is_complimentary) continue;
    const sponsor = link.source_show_sponsor_id ? sponsorById.get(link.source_show_sponsor_id) : undefined;
    const comp = link.source_ticket_id ? compById.get(link.source_ticket_id) : undefined;
    if (!sponsor && !comp) continue;
    const rowId = sponsor ? `sponsor-${sponsor.id}` : `comp-${comp!.id}`;
    const scanToken = clean(link.scan_token);
    if (!scanToken) { unavailable.push({ rowId, reason: "No entry code is available yet." }); continue; }
    const quantity = Math.max(0, Math.floor(link.ticket_count));
    if (!quantity) { unavailable.push({ rowId, reason: "No admissions are available on this record." }); continue; }
    const seats = sortSponsorAdmissionSeats(assignmentsByLink.get(link.id) ?? []);
    const library = relation(sponsor?.sponsor);
    passes.push({
      id: link.id,
      rowId,
      sponsorName: sponsor ? sponsorName(sponsor, clean(link.customer_name) || "CMMS Sponsor") : clean(comp?.guest_name) || clean(link.customer_name) || "Complimentary Guest",
      contactName: clean(library?.contact_person) || clean(link.customer_name) || clean(comp?.guest_name),
      admissionLabel: sponsor ? "Complimentary Sponsor Admission" : "Complimentary Admission",
      quantity,
      scanToken,
      seats,
      seatingState: seats.length ? "assigned" : link.submitted_at ? "nss" : "pending",
    });
  }
  return { passes, unavailable };
}

export function sponsorAdmissionSeatSummary(pass: SponsorAdmissionPass) {
  if (pass.seatingState === "nss") return { heading: "NO SEAT SELECTED", lines: ["Admission is valid without an assigned reserved seat."] };
  if (pass.seatingState === "pending") return { heading: "SEATING NOT ASSIGNED", lines: ["Reserved-seat selection has not been completed yet."] };
  const first = pass.seats[0]!;
  const sameSection = pass.seats.every((seat) => seat.section === first.section);
  const sameRow = pass.seats.every((seat) => seat.row_label === first.row_label);
  if (sameSection && sameRow) return { heading: "YOUR RESERVED SEATS", lines: [`${first.section === "L" ? "LEFT" : first.section === "R" ? "RIGHT" : first.section} SECTION`, `ROW ${first.row_label}`, `SEATS ${pass.seats.map((seat) => seat.seat_number).join(", ")}`] };
  return { heading: "YOUR RESERVED SEATS", lines: [pass.seats.map((seat) => seat.seat_id).join(", ")] };
}

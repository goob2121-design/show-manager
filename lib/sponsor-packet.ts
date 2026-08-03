export type SponsorPacketSectionKey =
  | "showInformation"
  | "specialGuest"
  | "complimentaryTickets"
  | "reservedSeating"
  | "venueDirections"
  | "bandInformation"
  | "sponsorRecognition"
  | "contactInformation";

export type SponsorPacketBandMember = {
  sourceId: string | null;
  name: string;
  role: string;
  included: boolean;
};

export type SponsorPacketBandProfile = {
  id: string;
  profileKey: string;
  displayName: string;
  description: string;
  members: SponsorPacketBandMember[];
};

export type SponsorPacketDraft = {
  sponsorId: string;
  showId: string;
  sponsorName: string;
  sponsorLogoUrl: string;
  contactPerson: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  greetingName: string;
  packetDate: string;
  showDate: string;
  doorsTime: string;
  showTime: string;
  venueName: string;
  venueAddress: string;
  subject: string;
  thankYouMessage: string;
  additionalNote: string;
  closingName: string;
  closingTitle: string;
  contactEmail: string;
  contactPhone: string;
  includeTickets: boolean;
  ticketCount: number;
  admissionType: "reserved" | "general";
  seatLabels: string;
  seatInstructions: string;
  ticketEnclosureNote: string;
  guestName: string;
  guestBio: string;
  guestPhotoUrl: string;
  bandHeading: string;
  bandDescription: string;
  bandMembers: SponsorPacketBandMember[];
  sponsorRecognition: string;
  sections: Record<SponsorPacketSectionKey, boolean>;
};

export type SponsorPacketSavedDraft = {
  id: string;
  show_id: string;
  sponsor_library_id: string;
  packet_date: string | null;
  sponsor_name_override: string | null;
  contact_person: string | null;
  greeting_name: string | null;
  mailing_address_line_1: string | null;
  mailing_address_line_2: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  letter_heading: string | null;
  personal_message: string | null;
  additional_note: string | null;
  closing_name: string | null;
  closing_title: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  show_date_override: string | null;
  doors_time_override: string | null;
  show_time_override: string | null;
  include_tickets: boolean;
  ticket_quantity: number | null;
  admission_type: string | null;
  assigned_seat_labels: string[] | null;
  seat_instructions: string | null;
  ticket_enclosure_note: string | null;
  enabled_sections: Partial<Record<SponsorPacketSectionKey, boolean>> | null;
  guest_name_override: string | null;
  guest_bio_override: string | null;
  guest_photo_url_override: string | null;
  band_heading_override: string | null;
  band_description_override: string | null;
  band_members_override: SponsorPacketBandMember[] | null;
  sponsor_recognition_override: string | null;
  venue_name_override: string | null;
  venue_address_override: string | null;
  created_at: string;
  updated_at: string;
};

export type SponsorPacketSeatSummaryGroup = {
  section: string;
  sectionLabel: string;
  rowLabel: string;
  seatNumbers: number[];
  summaryLabel: string;
};

export type SponsorPacketSeatSummary = {
  validSeatIds: string[];
  invalidSeatIds: string[];
  groups: SponsorPacketSeatSummaryGroup[];
};

export type SponsorPacketShowSource = { id: string; slug: string; name: string; show_date: string | null; venue: string | null; venue_address: string | null; show_start_time: string | null };
export type SponsorPacketSponsorSource = { id: string; name: string; sponsor_code?: string | null; logo_url?: string | null; recognition_notes?: string | null };
export type SponsorPacketShowSponsorSource = { show_id: string; sponsor_id: string | null; comp_ticket_allowance: number; recognition_notes: string | null };
export type SponsorPacketGuestSource = { show_id: string; name: string | null; greeting_name?: string | null; short_bio: string | null; full_bio: string | null; photo_url: string | null };
export type SponsorPacketReservedLinkSource = { id: string; show_id: string; customer_name: string };
export type SponsorPacketSeatAssignmentSource = { show_id: string; seating_link_id: string | null; seat_id: string };

export const DEFAULT_SPONSOR_THANK_YOU = `On behalf of everyone involved with the Cumberland Mountain Music Show, I would like to personally thank you for your generosity toward our upcoming event.

Your generous support helps us present a family-friendly evening of bluegrass, gospel, classic country, and Appalachian music while preserving the traditions that make our region so special.

Because of partners like you, we're able to keep the Cumberland Mountain Music Show welcoming, affordable, and enjoyable for families throughout our community.

Enclosed in your Sponsor Packet is information about the upcoming show, our featured guest, venue details, and any complimentary tickets or reserved seating included with your packet. We hope these materials answer any questions and help make your visit to the Cumberland Mountain Music Show as enjoyable as possible.

We truly appreciate your support and look forward to seeing you at the upcoming Cumberland Mountain Music Show. Thank you for helping make another successful season possible. We are honored to have you as part of the CMMS family.`;
export const DEFAULT_VENUE_NAME = "Lincoln Memorial University — Cumberland Gap Convention Center";
export const DEFAULT_VENUE_ADDRESS = "601 Colwyn Avenue\nCumberland Gap, TN 37724";
export const DEFAULT_SPONSOR_PACKET_SECTIONS: Record<SponsorPacketSectionKey, boolean> = { showInformation: true, specialGuest: true, complimentaryTickets: true, reservedSeating: true, venueDirections: true, bandInformation: true, sponsorRecognition: true, contactInformation: true };
export const DEFAULT_SPONSOR_RECOGNITION = "As one of our valued sponsors, your business will be recognized through our event program, website, social media, and live announcements during the Cumberland Mountain Music Show. We sincerely appreciate your support of live music in our community.";

const SPONSOR_PACKET_RESERVED_SEATING_SECTION_CONFIGS = [
  { label: "Left Section", prefix: "L", rows: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const, seatsPerRow: 10 },
  { label: "Right Section", prefix: "R", rows: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const, seatsPerRow: 10 },
] as const;

type SponsorPacketReservedSeatDefinition = { seatId: string; section: "L" | "R"; rowLabel: string; seatNumber: number };

const SPONSOR_PACKET_RESERVED_SEAT_DEFINITIONS: SponsorPacketReservedSeatDefinition[] = SPONSOR_PACKET_RESERVED_SEATING_SECTION_CONFIGS.flatMap((section) =>
  section.rows.flatMap((rowLabel) =>
    Array.from({ length: section.seatsPerRow }, (_, index) => index + 1).map((seatNumber) => ({
      seatId: `${section.prefix}-${rowLabel}${seatNumber}`,
      section: section.prefix,
      rowLabel,
      seatNumber,
    })),
  ),
);

function getSponsorPacketReservedSeatDefinition(seatId: string) {
  return SPONSOR_PACKET_RESERVED_SEAT_DEFINITIONS.find((seat) => seat.seatId === seatId) ?? null;
}

function sortSponsorPacketReservedSeatIds(seatIds: string[]) {
  const positionBySeatId = new Map(SPONSOR_PACKET_RESERVED_SEAT_DEFINITIONS.map((seat, index) => [seat.seatId, index]));
  return [...seatIds].sort((left, right) => (positionBySeatId.get(left) ?? Number.MAX_SAFE_INTEGER) - (positionBySeatId.get(right) ?? Number.MAX_SAFE_INTEGER));
}

function normalizeName(value: string) { return value.trim().toLocaleLowerCase(); }
function savedText(value: string | null | undefined, fallback: string) { return value === null || value === undefined ? fallback : value; }

export function formatSponsorPacketDate(value: string) {
  if (!value) return "";
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
}

export function formatSponsorPacketShowDate(value: string) {
  if (!value) return "the upcoming";
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(parsed);
}

export function formatSponsorPacketTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const explicitTwelveHour = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
  if (explicitTwelveHour) {
    const hour = Number(explicitTwelveHour[1]);
    if (hour < 1 || hour > 12) return value;
    return `${hour}:${explicitTwelveHour[2]} ${explicitTwelveHour[3].toUpperCase()}`;
  }
  const twentyFourHour = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!twentyFourHour) return value;
  const hour = Number(twentyFourHour[1]);
  if (hour < 0 || hour > 23) return value;
  return `${hour % 12 || 12}:${twentyFourHour[2]} ${hour >= 12 ? "PM" : "AM"}`;
}
export function formatSponsorPacketSeatLabel(seatId: string) { return seatId.trim(); }

export function findSponsorSeatLabels(input: { sponsorName: string; showId: string; links: SponsorPacketReservedLinkSource[]; assignments: SponsorPacketSeatAssignmentSource[] }) {
  const sponsorName = normalizeName(input.sponsorName);
  if (!sponsorName) return [];
  const matchingLinkIds = new Set(input.links.filter((link) => link.show_id === input.showId && normalizeName(link.customer_name) === sponsorName).map((link) => link.id));
  if (matchingLinkIds.size === 0) return [];
  return [...new Set(input.assignments.filter((assignment) => assignment.show_id === input.showId && Boolean(assignment.seating_link_id && matchingLinkIds.has(assignment.seating_link_id))).map((assignment) => formatSponsorPacketSeatLabel(assignment.seat_id)).filter(Boolean))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

export function buildSponsorTicketParagraph(draft: SponsorPacketDraft) {
  if (!draft.includeTickets || draft.ticketCount <= 0) return null;
  const countWord = draft.ticketCount === 1 ? "one" : String(draft.ticketCount);
  const ticketWord = draft.ticketCount === 1 ? "ticket" : "tickets";
  if (draft.admissionType === "general") return `Enclosed ${draft.ticketCount === 1 ? "is" : "are"} ${countWord} complimentary general-admission ${ticketWord} for the Cumberland Mountain Music Show.`;
  return `Enclosed ${draft.ticketCount === 1 ? "is" : "are"} ${countWord} complimentary reserved-seat ${ticketWord} for the Cumberland Mountain Music Show.`;
}

function formatSeatNumberRanges(seatNumbers: number[]) {
  const uniqueSeatNumbers = [...new Set(seatNumbers)].sort((left, right) => left - right);
  if (uniqueSeatNumbers.length === 0) return "";

  const ranges: string[] = [];
  let start = uniqueSeatNumbers[0];
  let end = uniqueSeatNumbers[0];

  for (let index = 1; index < uniqueSeatNumbers.length; index += 1) {
    const current = uniqueSeatNumbers[index];
    if (current === end + 1) {
      end = current;
      continue;
    }
    ranges.push(start === end ? `${start}` : `${start}–${end}`);
    start = current;
    end = current;
  }

  ranges.push(start === end ? `${start}` : `${start}–${end}`);

  if (ranges.length === 1) return ranges[0];
  if (ranges.length === 2) return `${ranges[0]} and ${ranges[1]}`;
  return `${ranges.slice(0, -1).join(", ")}, and ${ranges[ranges.length - 1]}`;
}

export function buildSponsorPacketSeatSummary(seatIds: string[]) : SponsorPacketSeatSummary {
  const validDefinitions: SponsorPacketReservedSeatDefinition[] = sortSponsorPacketReservedSeatIds(
    [...new Set(seatIds.map((seatId) => seatId.trim()).filter(Boolean))]
      .filter((seatId) => Boolean(getSponsorPacketReservedSeatDefinition(seatId))),
  ).flatMap((seatId) => {
    const definition = getSponsorPacketReservedSeatDefinition(seatId);
    return definition ? [definition] : [];
  });

  const validSeatIds = validDefinitions.map((definition) => definition.seatId);
  const invalidSeatIds = [...new Set(seatIds.map((seatId) => seatId.trim()).filter(Boolean))]
    .filter((seatId) => !validSeatIds.includes(seatId));

  const sectionLabelByPrefix = new Map(SPONSOR_PACKET_RESERVED_SEATING_SECTION_CONFIGS.map((section) => [section.prefix, section.label]));
  const grouped = new Map<string, SponsorPacketSeatSummaryGroup>();

  for (const definition of validDefinitions) {
    const key = `${definition.section}:${definition.rowLabel}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        section: definition.section,
        sectionLabel: sectionLabelByPrefix.get(definition.section) ?? definition.section,
        rowLabel: definition.rowLabel,
        seatNumbers: [],
        summaryLabel: "",
      });
    }
    grouped.get(key)?.seatNumbers.push(definition.seatNumber);
  }

  const groups = [...grouped.values()].map((group) => {
    const seatNumbers = [...group.seatNumbers].sort((left, right) => left - right);
    const seatRangeLabel = formatSeatNumberRanges(seatNumbers);
    const seatLabelPrefix = seatNumbers.length === 1 ? "Seat" : "Seats";
    return {
      ...group,
      seatNumbers,
      summaryLabel: `${group.sectionLabel}, Row ${group.rowLabel}: ${seatLabelPrefix} ${seatRangeLabel}`,
    };
  });

  return {
    validSeatIds,
    invalidSeatIds,
    groups,
  };
}

export function cloneBandMembers(members: SponsorPacketBandMember[]) { return members.map((member) => ({ ...member })); }

export function buildSponsorPacketDraft(input: { sponsor: SponsorPacketSponsorSource; show: SponsorPacketShowSource; showSponsor?: SponsorPacketShowSponsorSource | null; guest?: SponsorPacketGuestSource | null; seatLabels?: string[]; bandProfile?: SponsorPacketBandProfile | null; today?: string }): SponsorPacketDraft {
  const allowance = Math.max(0, input.showSponsor?.comp_ticket_allowance ?? 0);
  const seatLabels = input.seatLabels ?? [];
  return {
    sponsorId: input.sponsor.id, showId: input.show.id, sponsorName: input.sponsor.name, sponsorLogoUrl: input.sponsor.logo_url?.trim() || "", contactPerson: "", address1: "", address2: "", city: "", state: "", zip: "", greetingName: input.sponsor.name,
    packetDate: input.today ?? new Date().toISOString().slice(0, 10), showDate: input.show.show_date ?? "", doorsTime: "", showTime: input.show.show_start_time ?? "", venueName: input.show.venue?.trim() || DEFAULT_VENUE_NAME, venueAddress: input.show.venue_address?.trim() || DEFAULT_VENUE_ADDRESS,
    subject: "Thank You for Supporting the Cumberland Mountain Music Show", thankYouMessage: DEFAULT_SPONSOR_THANK_YOU, additionalNote: "", closingName: "Bryan Turner", closingTitle: "Owner & Producer", contactEmail: "info@cumberlandmountainmusic.com", contactPhone: "",
    includeTickets: allowance > 0, ticketCount: allowance, admissionType: seatLabels.length > 0 ? "reserved" : "general", seatLabels: seatLabels.join(", "), seatInstructions: "", ticketEnclosureNote: "",
    guestName: input.guest?.name?.trim() || "", guestBio: input.guest?.short_bio?.trim() || input.guest?.full_bio?.trim() || "", guestPhotoUrl: input.guest?.photo_url?.trim() || "",
    bandHeading: input.bandProfile?.displayName ?? "", bandDescription: input.bandProfile?.description ?? "", bandMembers: cloneBandMembers(input.bandProfile?.members ?? []),
    sponsorRecognition: input.showSponsor?.recognition_notes?.trim() || input.sponsor.recognition_notes?.trim() || DEFAULT_SPONSOR_RECOGNITION, sections: { ...DEFAULT_SPONSOR_PACKET_SECTIONS },
  };
}

export function applySavedSponsorPacketDraft(base: SponsorPacketDraft, saved: SponsorPacketSavedDraft): SponsorPacketDraft {
  return {
    ...base,
    sponsorName: savedText(saved.sponsor_name_override, base.sponsorName), contactPerson: savedText(saved.contact_person, base.contactPerson), greetingName: savedText(saved.greeting_name, base.greetingName), address1: savedText(saved.mailing_address_line_1, base.address1), address2: savedText(saved.mailing_address_line_2, base.address2), city: savedText(saved.mailing_city, base.city), state: savedText(saved.mailing_state, base.state), zip: savedText(saved.mailing_zip, base.zip),
    packetDate: saved.packet_date ?? base.packetDate, showDate: saved.show_date_override ?? base.showDate, doorsTime: savedText(saved.doors_time_override, base.doorsTime), showTime: savedText(saved.show_time_override, base.showTime), venueName: savedText(saved.venue_name_override, base.venueName), venueAddress: savedText(saved.venue_address_override, base.venueAddress),
    subject: savedText(saved.letter_heading, base.subject), thankYouMessage: savedText(saved.personal_message, base.thankYouMessage), additionalNote: savedText(saved.additional_note, base.additionalNote), closingName: savedText(saved.closing_name, base.closingName), closingTitle: savedText(saved.closing_title, base.closingTitle), contactEmail: savedText(saved.contact_email, base.contactEmail), contactPhone: savedText(saved.contact_phone, base.contactPhone),
    includeTickets: saved.include_tickets, ticketCount: saved.ticket_quantity ?? 0, admissionType: saved.admission_type === "reserved" ? "reserved" : "general", seatLabels: (saved.assigned_seat_labels ?? []).join(", "), seatInstructions: savedText(saved.seat_instructions, base.seatInstructions), ticketEnclosureNote: savedText(saved.ticket_enclosure_note, base.ticketEnclosureNote),
    guestName: savedText(saved.guest_name_override, base.guestName), guestBio: savedText(saved.guest_bio_override, base.guestBio), guestPhotoUrl: savedText(saved.guest_photo_url_override, base.guestPhotoUrl), bandHeading: savedText(saved.band_heading_override, base.bandHeading), bandDescription: savedText(saved.band_description_override, base.bandDescription), bandMembers: Array.isArray(saved.band_members_override) ? cloneBandMembers(saved.band_members_override) : cloneBandMembers(base.bandMembers), sponsorRecognition: savedText(saved.sponsor_recognition_override, base.sponsorRecognition), sections: { ...base.sections, ...(saved.enabled_sections ?? {}) },
  };
}

export function serializeSponsorPacketDraft(draft: SponsorPacketDraft) {
  return {
    sponsor_name_override: draft.sponsorName, contact_person: draft.contactPerson, greeting_name: draft.greetingName, mailing_address_line_1: draft.address1, mailing_address_line_2: draft.address2, mailing_city: draft.city, mailing_state: draft.state, mailing_zip: draft.zip,
    packet_date: draft.packetDate || null, show_date_override: draft.showDate || null, doors_time_override: draft.doorsTime, show_time_override: draft.showTime, venue_name_override: draft.venueName, venue_address_override: draft.venueAddress,
    letter_heading: draft.subject, personal_message: draft.thankYouMessage, additional_note: draft.additionalNote, closing_name: draft.closingName, closing_title: draft.closingTitle, contact_email: draft.contactEmail, contact_phone: draft.contactPhone,
    include_tickets: draft.includeTickets, ticket_quantity: Math.max(0, draft.ticketCount), admission_type: draft.admissionType, assigned_seat_labels: draft.seatLabels.split(",").map((seat) => seat.trim()).filter(Boolean), seat_instructions: draft.seatInstructions, ticket_enclosure_note: draft.ticketEnclosureNote, enabled_sections: draft.sections,
    guest_name_override: draft.guestName, guest_bio_override: draft.guestBio, guest_photo_url_override: draft.guestPhotoUrl, band_heading_override: draft.bandHeading, band_description_override: draft.bandDescription, band_members_override: cloneBandMembers(draft.bandMembers), sponsor_recognition_override: draft.sponsorRecognition,
  };
}

import { RESERVED_SEATING_VENUE } from "@/lib/reserved-seating";

type GeneratedReservedSeatMessageInput = {
  customerName: string;
  ticketCount: number;
  absoluteUrl: string;
  formattedDate: string;
};

export function buildReservedSeatingMessageSubject() {
  return "Your Reserved Seating Link for Cumberland Mountain Music Show";
}

export function buildReservedSeatingMessageBody({
  customerName,
  ticketCount,
  absoluteUrl,
  formattedDate,
}: GeneratedReservedSeatMessageInput) {
  return [
    `Hi ${customerName},`,
    "",
    "Thank you for purchasing tickets to the Cumberland Mountain Music Show!",
    "",
    "Reserved seating is available for this show. You can select your seats using your private seat-selection link below:",
    "",
    absoluteUrl,
    "",
    "Show Information:",
    "Cumberland Mountain Music Show",
    formattedDate !== "Date TBD" ? formattedDate : "Date TBD",
    RESERVED_SEATING_VENUE.venueName,
    RESERVED_SEATING_VENUE.venueAddress,
    "",
    `Please choose up to ${ticketCount} seat${ticketCount === 1 ? "" : "s"}. Once your seats are confirmed, they will be reserved for you.`,
    "",
    "If you prefer not to select your seats, that's perfectly fine too. We'll be happy to reserve seats for you and have them ready when you arrive.",
    "",
    "If you have any trouble with the link, just reply to this message and we'll be happy to help.",
    "",
    "Thank you,",
    "Cumberland Mountain Music Show",
  ].join("\n");
}

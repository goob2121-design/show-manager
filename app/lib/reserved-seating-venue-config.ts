// Future reserved seating venue and layout changes should be made here so
// admin, customer, helpers, and printing all stay in sync.
export const RESERVED_SEATING_SECTION_CONFIG = [
  {
    key: "left",
    label: "Left Section",
    prefix: "L",
    rows: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const,
    seatsPerRow: 10,
  },
  {
    key: "right",
    label: "Right Section",
    prefix: "R",
    rows: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const,
    seatsPerRow: 10,
  },
] as const;

export const RESERVED_SEATING_VENUE_CONFIG = {
  venueName: "Cumberland Gap Convention Center",
  venueAddress: "601 Colwyn St, Cumberland Gap, TN 37724",
  venuePhotoPath: "/cumberland-gap-convention-center.jpg",
  venuePhotoFallbackPath: "/portal_bkg.png",
  stageLabel: "Stage",
  frontLabel: "Front Of Room",
  backLabel: "Back Of Room",
  aisleLabel: "Aisle",
  aisleLabelRows: [0, 4, 7] as const,
  sections: RESERVED_SEATING_SECTION_CONFIG,
} as const;

export type ReservedSeatingVenueConfig = typeof RESERVED_SEATING_VENUE_CONFIG;
export type ReservedSeatingSectionConfig = (typeof RESERVED_SEATING_SECTION_CONFIG)[number];
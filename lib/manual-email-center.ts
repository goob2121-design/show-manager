export const MANUAL_EMAIL_REPLY_TO = "info@cumberlandmountainmusic.com";

export const manualEmailSenders = [
  {
    key: "info",
    label: "{{show_name}}",
    address: "info@cumberlandmountainmusic.com",
    from: "Cumberland Mountain Music Show <info@cumberlandmountainmusic.com>",
  },
  {
    key: "tickets",
    label: "CMMS Tickets",
    address: "tickets@cumberlandmountainmusic.com",
    from: "CMMS Tickets <tickets@cumberlandmountainmusic.com>",
  },
  {
    key: "help",
    label: "CMMS Help",
    address: "help@cumberlandmountainmusic.com",
    from: "CMMS Help <help@cumberlandmountainmusic.com>",
  },
] as const;

export type ManualEmailSenderKey = (typeof manualEmailSenders)[number]["key"];

export const manualEmailTemplates = [
  {
    key: "general",
    label: "General Message",
    subject: "A Message from the Cumberland Mountain Music Show",
    heading: "",
    ctaLabel: "",
    ctaUrl: "",
    message: [
      "Hi {{first_name}},",
      "",
      "We wanted to reach out with a message from the Cumberland Mountain Music Show.",
      "",
      "[Message]",
      "",
      "Thanks,",
      "Bryan Turner",
      "The Cumberland Mountain Music Show",
      "www.cumberlandmountainmusic.com",
    ].join("\n"),
  },
  {
    key: "complimentary_tickets",
    label: "Complimentary Tickets",
    subject: "Complimentary Tickets - Cumberland Mountain Music Show",
    heading: "",
    ctaLabel: "",
    ctaUrl: "",
    message: [
      "Hi {{first_name}},",
      "",
      "We would like to invite you to attend the upcoming Cumberland Mountain Music Show as our guest.",
      "",
      "Your complimentary ticket information is included below.",
      "",
      "Show:",
      "{{show_name}}",
      "",
      "Date:",
      "{{show_date}}",
      "",
      "Location:",
      "Cumberland Gap Convention Center",
      "601 Colwyn Ave",
      "Cumberland Gap, TN 37724",
      "",
      "Doors open at 6:00 PM and the show begins at 7:00 PM.",
      "",
      "We hope you can join us!",
      "",
      "Thanks,",
      "Bryan Turner",
      "The Cumberland Mountain Music Show",
      "www.cumberlandmountainmusic.com",
    ].join("\n"),
  },
  {
    key: "reserved_seating",
    label: "Reserved Seating",
    subject: "Reserved Seating Information - Cumberland Mountain Music Show",
    heading: "",
    ctaLabel: "",
    ctaUrl: "",
    message: [
      "Hi {{first_name}},",
      "",
      "Here is the reserved seating information for your upcoming visit to the Cumberland Mountain Music Show.",
      "",
      "{{reserved_seat_link}}",
      "",
      "If you have any questions, reply to this email and we will be glad to help.",
      "",
      "Thanks,",
      "The Cumberland Mountain Music Show",
    ].join("\n"),
  },
  {
    key: "sponsor_message",
    label: "Sponsor Message",
    subject: "Cumberland Mountain Music Show Sponsor Message",
    heading: "",
    ctaLabel: "",
    ctaUrl: "",
    message: [
      "Hi {{first_name}},",
      "",
      "Thank you for supporting the Cumberland Mountain Music Show.",
      "",
      "[Sponsor message]",
      "",
      "We appreciate your partnership.",
      "",
      "Thanks,",
      "Bryan Turner",
      "The Cumberland Mountain Music Show",
    ].join("\n"),
  },
  {
    key: "show_information",
    label: "Show Information",
    subject: "Cumberland Mountain Music Show Information",
    heading: "",
    ctaLabel: "",
    ctaUrl: "",
    message: [
      "Hi {{first_name}},",
      "",
      "Here is information for the upcoming Cumberland Mountain Music Show.",
      "",
      "Date:",
      "{{show_date}}",
      "",
      "Location:",
      "Cumberland Gap Convention Center",
      "601 Colwyn Ave",
      "Cumberland Gap, TN 37724",
      "",
      "Doors open at 6:00 PM and the show begins at 7:00 PM.",
      "",
      "We look forward to seeing you!",
      "",
      "The Cumberland Mountain Music Show",
      "www.cumberlandmountainmusic.com",
    ].join("\n"),
  },
  {
    key: "presale_early_access",
    label: "Presale / Early Access",
    subject: "Your CMMS Early Access Ticket Link",
    heading: "Early Access Tickets",
    ctaLabel: "EARLY ACCESS TICKETS",
    ctaUrl: "{{ticket_link}}",
    message: [
      "Hi {{first_name}},",
      "",
      "Since you're on the CMMS Mailing List, I wanted to send you the early-access ticket link for {{show_name}} on {{show_date}}.",
      "",
      "Early Access begins {{presale_start}}, and tickets open to the general public on {{public_sale_start}}. This gives you the first opportunity to purchase tickets and choose from the available reserved seats.",
      "",
      "Thanks for supporting the Cumberland Mountain Music Show!",
    ].join("\n"),
  },
  {
    key: "ticket_discount",
    label: "Save on Tickets / Promo Code",
    subject: "A Special Ticket Offer from the Cumberland Mountain Music Show",
    heading: "Save on Tickets to the Cumberland Mountain Music Show",
    ctaLabel: "Get Tickets",
    ctaUrl: "{{ticket_link}}",
    message: [
      "We have a special ticket offer for you!",
      "",
      "Use the special offer below when you purchase your tickets.",
      "",
      "We hope to see you at the show!",
      "",
      "Cumberland Mountain Music Show",
    ].join("\n"),
  },
  {
    key: "custom",
    label: "Custom",
    subject: "",
    heading: "",
    ctaLabel: "",
    ctaUrl: "",
    message: "",
  },
] as const;

export type ManualEmailTemplateKey = (typeof manualEmailTemplates)[number]["key"];

export function getManualEmailSender(key: string) {
  return manualEmailSenders.find((sender) => sender.key === key) ?? null;
}

export function getManualEmailTemplate(key: string) {
  return manualEmailTemplates.find((template) => template.key === key) ?? null;
}

export function isValidManualEmailAddress(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

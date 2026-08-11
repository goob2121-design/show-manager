export const MANUAL_EMAIL_REPLY_TO = "info@cumberlandmountainmusic.com";

export const manualEmailSenders = [
  {
    key: "info",
    label: "Cumberland Mountain Music Show",
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
    message: [
      "Hi [Name],",
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
    message: [
      "Hi [Name],",
      "",
      "We would like to invite you to attend the upcoming Cumberland Mountain Music Show as our guest.",
      "",
      "Your complimentary ticket information is included below.",
      "",
      "Show:",
      "Cumberland Mountain Music Show",
      "",
      "Date:",
      "[Show Date]",
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
    message: [
      "Hi [Name],",
      "",
      "Here is the reserved seating information for your upcoming visit to the Cumberland Mountain Music Show.",
      "",
      "[Reserved seating details or seat-selection link]",
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
    message: [
      "Hi [Name],",
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
    message: [
      "Hi [Name],",
      "",
      "Here is information for the upcoming Cumberland Mountain Music Show.",
      "",
      "Date:",
      "[Show Date]",
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
    key: "custom",
    label: "Custom",
    subject: "",
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

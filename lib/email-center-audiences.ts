import { findUnresolvedEmailCenterMergeFields, resolveEmailCenterMergeFields, type EmailCenterMergeValues } from "./email-center";
import { isValidManualEmailAddress } from "./manual-email-center";

export const EMAIL_CENTER_AUDIENCES = [
  { key: "advance_ticket_buyers", label: "All Advance Ticket Buyers" },
  { key: "reserved_seat_customers", label: "Reserved Seat Customers" },
  { key: "reserved_with_seats", label: "Reserved Seat Customers With Seats Selected" },
  { key: "reserved_nss", label: "NSS / No Seat Selected Customers" },
  { key: "complimentary_guests", label: "Complimentary Guests" },
  { key: "sponsors", label: "Sponsors" },
  { key: "guest_contacts", label: "Guest Contacts" },
  { key: "all_show_contacts", label: "All Show Contacts" },
  { key: "mailing_list_subscribers", label: "Mailing List Subscribers" },
] as const;

export type EmailCenterAudienceKey = (typeof EMAIL_CENTER_AUDIENCES)[number]["key"];
export type EmailCenterAudienceRecipient = {
  id: string;
  name: string;
  email: string;
  sourceLabel: string;
  detail: string;
  mergeFields: EmailCenterMergeValues;
  audienceKeys: EmailCenterAudienceKey[];
};

function metadataScore(recipient: EmailCenterAudienceRecipient) {
  return (recipient.mergeFields.seat_numbers ? 8 : 0)
    + (recipient.mergeFields.ticket_quantity ? 4 : 0)
    + (recipient.mergeFields.reserved_seat_link ? 2 : 0)
    + (recipient.name ? 1 : 0);
}

export function dedupeEmailCenterAudienceRecipients(records: EmailCenterAudienceRecipient[]) {
  const unique = new Map<string, EmailCenterAudienceRecipient>();
  const missing: EmailCenterAudienceRecipient[] = [];
  for (const record of records) {
    const normalizedEmail = record.email.trim().toLowerCase();
    if (!normalizedEmail) {
      missing.push({ ...record, email: "" });
      continue;
    }
    const existing = unique.get(normalizedEmail);
    if (!existing) {
      unique.set(normalizedEmail, { ...record, email: normalizedEmail, audienceKeys: [...new Set(record.audienceKeys)] });
      continue;
    }
    const preferred = metadataScore(record) > metadataScore(existing) ? record : existing;
    const secondary = preferred === record ? existing : record;
    unique.set(normalizedEmail, {
      ...preferred,
      email: normalizedEmail,
      audienceKeys: [...new Set([...existing.audienceKeys, ...record.audienceKeys, "all_show_contacts" as const])],
      mergeFields: Object.fromEntries(
        Object.entries({ ...secondary.mergeFields, ...preferred.mergeFields }).filter(([, value]) => Boolean(value)),
      ),
    });
  }
  return {
    recipients: [...unique.values(), ...missing],
    recordsFound: records.length,
    duplicatesRemoved: records.length - unique.size - missing.length,
    uniqueRecipients: unique.size + missing.length,
  };
}

export function recipientsForEmailCenterAudience(records: EmailCenterAudienceRecipient[], audienceKey: EmailCenterAudienceKey) {
  return dedupeEmailCenterAudienceRecipients(records.filter((record) => record.audienceKeys.includes(audienceKey)));
}

export function renderEmailCenterRecipient(input: {
  recipient: EmailCenterAudienceRecipient;
  subjectTemplate: string;
  messageTemplate: string;
  headingTemplate?: string;
  ctaLabelTemplate?: string;
  ctaUrlTemplate?: string;
  promoOfferTemplate?: string;
  promoCodeTemplate?: string;
  senderValid: boolean;
}) {
  const subject = resolveEmailCenterMergeFields(input.subjectTemplate, input.recipient.mergeFields).rendered;
  const message = resolveEmailCenterMergeFields(input.messageTemplate, input.recipient.mergeFields).rendered;
  const heading = resolveEmailCenterMergeFields(input.headingTemplate ?? "", input.recipient.mergeFields).rendered;
  const ctaLabel = resolveEmailCenterMergeFields(input.ctaLabelTemplate ?? "", input.recipient.mergeFields).rendered;
  const ctaUrl = resolveEmailCenterMergeFields(input.ctaUrlTemplate ?? "", input.recipient.mergeFields).rendered;
  const promoOffer = resolveEmailCenterMergeFields(input.promoOfferTemplate ?? "", input.recipient.mergeFields).rendered;
  const promoCode = resolveEmailCenterMergeFields(input.promoCodeTemplate ?? "", input.recipient.mergeFields).rendered;
  const unresolved = findUnresolvedEmailCenterMergeFields(subject, message, heading, ctaLabel, ctaUrl, promoOffer, promoCode);
  const problems: string[] = [];
  if (!input.recipient.email.trim()) problems.push("Missing email address");
  else if (!isValidManualEmailAddress(input.recipient.email.trim().toLowerCase())) problems.push("Invalid email address");
  if (!input.senderValid) problems.push("Invalid sender");
  if (!subject.trim()) problems.push("Subject is blank");
  if (!message.trim()) problems.push("Message is blank");
  if (Boolean(ctaLabel.trim()) !== Boolean(ctaUrl.trim())) problems.push("CTA label and URL must both be provided");
  if (ctaUrl.trim() && !/^https:\/\//i.test(ctaUrl.trim())) problems.push("CTA URL must use HTTPS");
  for (const field of unresolved) problems.push(`${field} unavailable`);
  if (Boolean(promoOffer.trim()) !== Boolean(promoCode.trim())) problems.push("Promo offer and code must both be provided");
  return { subject, message, heading, ctaLabel, ctaUrl, promoOffer, promoCode, problems, ready: problems.length === 0 };
}

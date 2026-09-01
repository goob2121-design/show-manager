import type { EmailCenterMergeValues } from "./email-center";

export const PRESALE_EMAIL_TEMPLATE_KEY = "presale_early_access";

export function formatEmailCenterSaleDate(value: string | null | undefined) {
  if (!value?.trim()) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hasMeaningfulTime = !/T00:00:00(?:\.000)?(?:Z|[+-]\d\d:\d\d)?$/i.test(value.trim());
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    ...(hasMeaningfulTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "America/New_York",
  }).format(date).replace(",", " at");
}

export function withPresaleGreetingFallback(fields: EmailCenterMergeValues) {
  const isLegacyUnnamedMailingListRecipient = fields.first_name === "Friend" && fields.full_name === "CMMS Friend";
  return {
    ...fields,
    first_name: fields.first_name?.trim() && !isLegacyUnnamedMailingListRecipient ? fields.first_name.trim() : "there",
  } satisfies EmailCenterMergeValues;
}

export function validatePresaleEmailFields(fields: EmailCenterMergeValues) {
  const problems: string[] = [];
  if (!fields.show_name?.trim()) problems.push("The selected show is unavailable.");
  if (!fields.show_date?.trim()) problems.push("The selected show's date is missing.");
  if (!fields.presale_start?.trim()) problems.push("The selected show's presale start date is missing.");
  if (!fields.public_sale_start?.trim()) problems.push("The selected show's public sale start date is missing.");
  if (!fields.presale_code?.trim()) problems.push("This show does not have a presale access code in Show Details.");
  if (!fields.ticket_link?.trim() || !/^https:\/\//i.test(fields.ticket_link.trim())) {
    problems.push("This show does not have a valid ticket link in Show Details.");
  }
  return problems;
}

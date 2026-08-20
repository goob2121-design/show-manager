import type { SupportedResendEmailEventType } from "./reserved-seat-email-tracking";

export const EMAIL_CENTER_MERGE_FIELDS = [
  "first_name", "last_name", "full_name", "email", "show_name", "show_date",
  "show_time", "ticket_quantity", "seat_numbers", "reserved_seat_link", "promo_code",
  "promo_offer", "ticket_link",
] as const;

export type EmailCenterMergeField = (typeof EMAIL_CENTER_MERGE_FIELDS)[number];
export type EmailCenterMergeValues = Partial<Record<EmailCenterMergeField, string>>;

const MERGE_FIELD_PATTERN = /{{\s*([a-z_]+)\s*}}/gi;

export function splitEmailCenterName(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
    fullName: parts.join(" "),
  };
}

export function resolveEmailCenterMergeFields(value: string, fields: EmailCenterMergeValues) {
  const unresolved = new Set<string>();
  const rendered = value.replace(MERGE_FIELD_PATTERN, (match, rawKey: string) => {
    const key = rawKey.toLowerCase() as EmailCenterMergeField;
    if (!EMAIL_CENTER_MERGE_FIELDS.includes(key) || !fields[key]?.trim()) {
      unresolved.add(match);
      return match;
    }
    return fields[key]!;
  });
  return { rendered, unresolved: [...unresolved] };
}

export function findUnresolvedEmailCenterMergeFields(...values: string[]) {
  return [...new Set(values.flatMap((value) => [...value.matchAll(MERGE_FIELD_PATTERN)].map((match) => match[0])))];
}

const STATUS_PRECEDENCE: Record<string, number> = {
  queued: 0, sent: 1, delivered: 2, opened: 3, clicked: 4,
  delivery_delayed: 5, failed: 6, bounced: 7, complained: 8,
};

export function emailCenterStatusForEvent(type: SupportedResendEmailEventType) {
  return type.replace("email.", "");
}

export function chooseEmailCenterStatus(current: string | null | undefined, eventType: SupportedResendEmailEventType) {
  const next = emailCenterStatusForEvent(eventType);
  return (STATUS_PRECEDENCE[next] ?? 0) >= (STATUS_PRECEDENCE[current ?? "queued"] ?? 0) ? next : (current ?? "queued");
}

export function sanitizeTrackedEmailUrl(rawUrl: string | null | undefined) {
  if (!rawUrl?.trim()) return null;
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|code|secret|signature|auth/i.test(key)) url.searchParams.set(key, "[redacted]");
    }
    if (/\/reserved-seating\//i.test(url.pathname)) url.pathname = "/reserved-seating/[redacted]";
    return url.toString();
  } catch {
    return null;
  }
}

export function emailCenterEventFingerprint(input: {
  providerEventId?: string | null;
  resendMessageId: string;
  eventType: string;
  createdAt: string;
  clickedUrl?: string | null;
}) {
  if (input.providerEventId?.trim()) return `provider:${input.providerEventId.trim()}`;
  return ["fallback", input.resendMessageId, input.eventType, input.createdAt, input.clickedUrl ?? ""].join(":");
}

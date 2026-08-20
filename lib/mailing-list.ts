import { createHmac, timingSafeEqual } from "node:crypto";

export const MAILING_LIST_STATUSES = ["active", "unsubscribed"] as const;
export const MAILING_LIST_SOURCES = ["website", "admin", "ticket_opt_in", "import", "other"] as const;
export type MailingListStatus = (typeof MAILING_LIST_STATUSES)[number];
export type MailingListSource = (typeof MAILING_LIST_SOURCES)[number];

export function normalizeMailingListEmail(value: string) { return value.trim().toLowerCase(); }
export function isValidMailingListEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeMailingListEmail(value)) && value.length <= 320; }
export function cleanMailingListName(value: unknown) { return typeof value === "string" ? value.trim().slice(0, 100) : ""; }
export function isMailingListSource(value: string): value is MailingListSource { return MAILING_LIST_SOURCES.includes(value as MailingListSource); }

function secret() {
  const value = process.env.MAILING_LIST_TOKEN_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!value) throw new Error("Mailing-list unsubscribe tokens are not configured.");
  return value;
}
function signature(id: string) { return createHmac("sha256", secret()).update(`mailing-list:${id}`).digest("base64url"); }
export function createMailingListUnsubscribeToken(id: string) { return `${id}.${signature(id)}`; }
export function verifyMailingListUnsubscribeToken(token: string) {
  const [id, supplied, extra] = token.split(".");
  if (extra || !id || !supplied || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const expected = signature(id);
  const a = Buffer.from(supplied); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export function mailingListUnsubscribeUrl(origin: string, subscriberId: string) {
  return `${origin.replace(/\/$/, "")}/mailing-list/unsubscribe?token=${encodeURIComponent(createMailingListUnsubscribeToken(subscriberId))}`;
}

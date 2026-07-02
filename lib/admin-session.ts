import { createHmac, timingSafeEqual } from "crypto";

export const STAGEFLOW_ADMIN_COOKIE_PREFIX = "stageflow_admin_session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function getAdminSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "";
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(value: string) {
  const secret = getAdminSessionSecret();
  if (!secret) throw new Error("Missing admin session secret.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function getAdminSessionCookieName(slug: string) {
  return `${STAGEFLOW_ADMIN_COOKIE_PREFIX}_${slug.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function createAdminSessionCookieValue(slug: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE_SECONDS;
  const payload = `${base64Url(slug)}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSessionCookieValue(slug: string, cookieValue: string | undefined | null) {
  if (!cookieValue) return false;
  const [encodedSlug, expiresAtRaw, signature] = cookieValue.split(".");
  if (!encodedSlug || !expiresAtRaw || !signature) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  let cookieSlug = "";
  try { cookieSlug = Buffer.from(encodedSlug, "base64url").toString("utf8"); } catch { return false; }
  if (cookieSlug !== slug) return false;
  const expected = sign(`${encodedSlug}.${expiresAtRaw}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const adminSessionMaxAgeSeconds = ADMIN_SESSION_MAX_AGE_SECONDS;

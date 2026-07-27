import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "./admin-session";

export type ReservedSeatEmailStatusShowIdentity = {
  id: string;
  slug: string;
} | null;

export type ReservedSeatEmailStatusAccessResult =
  | { ok: true; canonicalSlug: string; cookieName: string; showId: string }
  | { ok: false; status: 400 | 401 | 404; error: string };

export function validateReservedSeatEmailStatusAccess(input: {
  requestedShowId: string;
  requestedSlug: string;
  canonicalShow: ReservedSeatEmailStatusShowIdentity;
  cookieValue: string | null | undefined;
}): ReservedSeatEmailStatusAccessResult {
  const requestedShowId = input.requestedShowId.trim();
  const requestedSlug = input.requestedSlug.trim();

  if (!requestedShowId || !requestedSlug) {
    return { ok: false, status: 400, error: "Show ID and slug are required." };
  }

  if (!input.canonicalShow || input.canonicalShow.id !== requestedShowId) {
    return { ok: false, status: 404, error: "Show was not found." };
  }

  if (input.canonicalShow.slug !== requestedSlug) {
    return { ok: false, status: 404, error: "Show was not found." };
  }

  const canonicalSlug = input.canonicalShow.slug;
  const cookieName = getAdminSessionCookieName(canonicalSlug);
  if (!verifyAdminSessionCookieValue(canonicalSlug, input.cookieValue)) {
    return { ok: false, status: 401, error: "Admin access is required." };
  }

  return {
    ok: true,
    canonicalSlug,
    cookieName,
    showId: input.canonicalShow.id,
  };
}

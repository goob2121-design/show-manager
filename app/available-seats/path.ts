export const PUBLIC_AVAILABLE_SEATS_PATH = "/available-seats";

export function buildPublicAvailableSeatsPath(showSlug?: string | null) {
  const normalizedSlug = showSlug?.trim();
  return normalizedSlug ? `${PUBLIC_AVAILABLE_SEATS_PATH}/${normalizedSlug}` : PUBLIC_AVAILABLE_SEATS_PATH;
}

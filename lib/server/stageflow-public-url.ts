const STAGEFLOW_PUBLIC_URL_ENV = "STAGEFLOW_PUBLIC_URL";

export function normalizeStageFlowPublicUrl(value: string | undefined = process.env.STAGEFLOW_PUBLIC_URL) {
  const trimmed = value?.trim().replace(/\/+$/, "") ?? "";
  if (!trimmed) throw new Error(`${STAGEFLOW_PUBLIC_URL_ENV} is not configured.`);

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${STAGEFLOW_PUBLIC_URL_ENV} must be a valid HTTPS URL.`);
  }

  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${STAGEFLOW_PUBLIC_URL_ENV} must be an HTTPS origin without a path, query, or credentials.`);
  }

  return url.origin;
}

export function getStageFlowPublicUrl() {
  return normalizeStageFlowPublicUrl();
}

export function buildReservedSeatSelectionUrl(selectionToken: string) {
  const token = selectionToken.trim();
  if (!token) throw new Error("A reserved-seat selection token is required.");
  return `${getStageFlowPublicUrl()}/reserved-seating/${encodeURIComponent(token)}`;
}

export function getStageFlowEmailLogoUrl() {
  return `${getStageFlowPublicUrl()}/cmms-logo.png`;
}

export function isStageFlowPublicUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.origin === getStageFlowPublicUrl();
  } catch {
    return false;
  }
}

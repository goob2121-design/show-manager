const STAGEFLOW_PUBLIC_URL_ENV = "STAGEFLOW_PUBLIC_URL";

type StageFlowPublicUrlOptions = {
  requestOrigin?: string;
  nodeEnv?: string;
};

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "::1" || normalized === "[::1]" || normalized.startsWith("127.");
}

export function normalizeStageFlowPublicUrl(
  value: string | undefined = process.env.STAGEFLOW_PUBLIC_URL,
  options: StageFlowPublicUrlOptions = {},
) {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const isProduction = nodeEnv === "production";
  const configured = value?.trim() ?? "";
  const fallback = !isProduction ? options.requestOrigin?.trim() ?? "" : "";
  const candidate = (configured || fallback).replace(/\/+$/, "");
  if (!candidate) throw new Error(`${STAGEFLOW_PUBLIC_URL_ENV} is not configured.`);

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${STAGEFLOW_PUBLIC_URL_ENV} must be a valid URL origin.`);
  }

  const hasInvalidShape = Boolean(url.username || url.password || url.search || url.hash || url.pathname !== "/");
  const validProtocol = url.protocol === "https:" || (!isProduction && url.protocol === "http:" && isLoopbackHostname(url.hostname));
  if (hasInvalidShape || !validProtocol) {
    throw new Error(
      isProduction
        ? `${STAGEFLOW_PUBLIC_URL_ENV} must be an HTTPS origin without a path, query, or credentials.`
        : `${STAGEFLOW_PUBLIC_URL_ENV} must be an HTTPS origin or a localhost HTTP origin without a path, query, or credentials.`,
    );
  }

  return url.origin;
}

export function getStageFlowPublicUrl(requestOrigin?: string) {
  return normalizeStageFlowPublicUrl(process.env.STAGEFLOW_PUBLIC_URL, { requestOrigin });
}

export function buildReservedSeatSelectionUrl(selectionToken: string, requestOrigin?: string) {
  const token = selectionToken.trim();
  if (!token) throw new Error("A reserved-seat selection token is required.");
  return `${getStageFlowPublicUrl(requestOrigin)}/reserved-seating/${encodeURIComponent(token)}`;
}

export function getStageFlowEmailLogoUrl(requestOrigin?: string) {
  return `${getStageFlowPublicUrl(requestOrigin)}/cmms-logo.png`;
}

export function isStageFlowPublicUrl(value: string, requestOrigin?: string) {
  try {
    const url = new URL(value.trim());
    return url.origin === getStageFlowPublicUrl(requestOrigin) &&
      normalizeStageFlowPublicUrl(url.origin, { requestOrigin }) === url.origin;
  } catch {
    return false;
  }
}
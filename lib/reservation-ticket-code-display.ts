import {
  DEFAULT_TICKET_CODE_FORMAT,
  generateCode128,
  generateQRCode,
  normalizeTicketCodeFormat,
  type TicketCodeFormat,
} from "@/lib/reservation-scan-tokens";

export type ReservationTicketCodeDisplay = {
  token: string;
  format: TicketCodeFormat;
  qrDataUri: string | null;
  code128DataUri: string | null;
  shortReference: string;
};

function normalizeScanToken(scanToken: string | null | undefined) {
  const trimmed = scanToken?.trim() ?? "";
  return trimmed || null;
}

export function buildReservationTicketCodeDisplay(
  scanToken: string | null | undefined,
  format?: string | null,
): ReservationTicketCodeDisplay | null {
  const normalizedToken = normalizeScanToken(scanToken);

  if (!normalizedToken) {
    return null;
  }

  const normalizedFormat = normalizeTicketCodeFormat(format ?? DEFAULT_TICKET_CODE_FORMAT);
  let qrDataUri: string | null = null;
  let code128DataUri: string | null = null;

  if (normalizedFormat === "qr" || normalizedFormat === "both") {
    try {
      qrDataUri = generateQRCode(normalizedToken).dataUri;
    } catch (error) {
      console.warn("Unable to render reservation QR code.", error);
    }
  }

  if (normalizedFormat === "code128" || normalizedFormat === "both") {
    try {
      code128DataUri = generateCode128(normalizedToken).dataUri;
    } catch (error) {
      console.warn("Unable to render reservation barcode.", error);
    }
  }

  if (!qrDataUri && !code128DataUri) {
    return null;
  }

  return {
    token: normalizedToken,
    format: normalizedFormat,
    qrDataUri,
    code128DataUri,
    shortReference: `...${normalizedToken.slice(-8)}`,
  };
}

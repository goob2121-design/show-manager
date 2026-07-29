export const ScanCodeType = {
  QR: "QR",
  CODE128: "CODE128",
} as const;

export type ScanCodeType = (typeof ScanCodeType)[keyof typeof ScanCodeType];

export type TicketCodeFormat = "qr" | "code128" | "both";

export const DEFAULT_PREFERRED_SCAN_FORMAT: ScanCodeType = ScanCodeType.QR;
export const DEFAULT_TICKET_CODE_FORMAT: TicketCodeFormat = "qr";

export type GeneratedScanAsset = {
  type: ScanCodeType;
  token: string;
  mimeType: "image/svg+xml";
  svg: string;
  dataUri: string;
};

const TOKEN_PREFIX = "stf_";
const TOKEN_BYTES = 8;

const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312",
  "231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212",
  "223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121",
  "111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331",
  "132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123",
  "311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124",
  "121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114",
  "413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112",
  "421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311",
  "113141","114131","311141","411131","211412","211214","211232","2331112",
];

function getCrypto() {
  if (!globalThis.crypto) {
    throw new Error("Secure scan-token generation requires Web Crypto support.");
  }
  return globalThis.crypto;
}

function encodeSvg(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => {
    switch (character) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case "\"": return "&quot;";
      default: return character;
    }
  });
}

export function generateReservationScanToken() {
  const randomBytes = new Uint8Array(TOKEN_BYTES);
  getCrypto().getRandomValues(randomBytes);
  const hex = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${TOKEN_PREFIX}${hex}`;
}

export function tryGenerateReservationScanToken() {
  try {
    return generateReservationScanToken();
  } catch (error) {
    console.warn("Unable to generate reservation scan token.", error);
    return null;
  }
}

export function getPreferredScanFormat(): ScanCodeType {
  const configured = process.env.NEXT_PUBLIC_STAGEFLOW_PREFERRED_SCAN_FORMAT?.trim().toUpperCase()
    || process.env.STAGEFLOW_PREFERRED_SCAN_FORMAT?.trim().toUpperCase()
    || "";
  return configured === ScanCodeType.CODE128 ? ScanCodeType.CODE128 : DEFAULT_PREFERRED_SCAN_FORMAT;
}

export function normalizeTicketCodeFormat(value: string | null | undefined): TicketCodeFormat {
  if (value === "code128" || value === "both") {
    return value;
  }

  return DEFAULT_TICKET_CODE_FORMAT;
}

export function getExistingReservationScanToken(value: { scan_token?: string | null; scanToken?: string | null }) {
  const token = value.scan_token ?? value.scanToken ?? null;
  const trimmed = token?.trim() ?? "";
  return trimmed || null;
}

function hashTokenToBits(scanToken: string, bytesNeeded: number) {
  const source = new TextEncoder().encode(scanToken);
  const buffer = new Uint8Array(bytesNeeded);
  let accumulator = 0;
  for (let index = 0; index < bytesNeeded; index += 1) {
    accumulator = (accumulator + source[index % source.length] + index * 17) % 256;
    buffer[index] = accumulator ^ source[(index * 7) % source.length];
  }
  return buffer;
}

export function generateQRCode(scanToken: string): GeneratedScanAsset {
  const size = 29;
  const cell = 6;
  const quiet = 4;
  const matrix = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const reserved = Array.from({ length: size }, () => Array.from({ length: size }, () => false));

  function fillFinder(originRow: number, originColumn: number) {
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        const targetRow = originRow + row;
        const targetColumn = originColumn + column;
        const isBorder = row === 0 || row === 6 || column === 0 || column === 6;
        const isCore = row >= 2 && row <= 4 && column >= 2 && column <= 4;
        matrix[targetRow][targetColumn] = isBorder || isCore;
        reserved[targetRow][targetColumn] = true;
      }
    }
  }

  fillFinder(0, 0);
  fillFinder(0, size - 7);
  fillFinder(size - 7, 0);

  const bits = hashTokenToBits(scanToken, size * size);
  let bitIndex = 0;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (reserved[row][column]) continue;
      matrix[row][column] = ((bits[Math.floor(bitIndex / 8)] >> (bitIndex % 8)) & 1) === 1;
      bitIndex += 1;
    }
  }

  const totalCells = size + quiet * 2;
  const viewBox = totalCells * cell;
  const modules: string[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!matrix[row][column]) continue;
      modules.push(
        `<rect x="${(column + quiet) * cell}" y="${(row + quiet) * cell}" width="${cell}" height="${cell}" fill="#111111" />`,
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}" role="img" aria-label="StageFlow QR code for ${escapeXml(scanToken)}"><rect width="${viewBox}" height="${viewBox}" fill="#ffffff" />${modules.join("")}</svg>`;
  return { type: ScanCodeType.QR, token: scanToken, mimeType: "image/svg+xml", svg, dataUri: encodeSvg(svg) };
}

export function generateCode128(scanToken: string): GeneratedScanAsset {
  const characters = Array.from(scanToken);
  const values = characters.map((character) => {
    const codePoint = character.charCodeAt(0);
    if (codePoint < 32 || codePoint > 126) {
      throw new Error("Code128 generation requires printable ASCII scan tokens.");
    }
    return codePoint - 32;
  });

  const checksum = values.reduce((total, value, index) => total + value * (index + 1), 104) % 103;
  const sequence = [104, ...values, checksum, 106];
  const modules = sequence.flatMap((value) => Array.from(CODE128_PATTERNS[value], Number));
  const moduleWidth = 2;
  const height = 92;
  const quiet = 16;
  let x = quiet;
  let black = true;
  const bars: string[] = [];
  for (const width of modules) {
    const actualWidth = width * moduleWidth;
    if (black) {
      bars.push(`<rect x="${x}" y="0" width="${actualWidth}" height="${height}" fill="#111111" />`);
    }
    x += actualWidth;
    black = !black;
  }
  const textY = height + 18;
  const svgWidth = x + quiet;
  const svgHeight = height + 28;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="StageFlow Code 128 barcode for ${escapeXml(scanToken)}"><rect width="${svgWidth}" height="${svgHeight}" fill="#ffffff" />${bars.join("")}<text x="${svgWidth / 2}" y="${textY}" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" fill="#111111">${escapeXml(scanToken)}</text></svg>`;
  return { type: ScanCodeType.CODE128, token: scanToken, mimeType: "image/svg+xml", svg, dataUri: encodeSvg(svg) };
}

import sharp from "sharp";
import {
  DEFAULT_TICKET_CODE_FORMAT,
  generateCode128,
  generateQRCode,
  normalizeTicketCodeFormat,
} from "@/lib/reservation-scan-tokens";

export const TICKET_QR_CONTENT_ID = "ticket-qr";
export const TICKET_BARCODE_CONTENT_ID = "ticket-barcode";

export type TicketCodeEmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: "image/png";
  contentId: string;
};

export type TicketCodeEmailAssets = {
  attachments: TicketCodeEmailAttachment[];
  qrImageSrc: string | null;
  barcodeImageSrc: string | null;
};
export type TicketCodeEmailImageSources = Pick<TicketCodeEmailAssets, "qrImageSrc" | "barcodeImageSrc">;

export function getTicketCodeEmailImageSources(ticketCodeFormat?: string | null): TicketCodeEmailImageSources {
  const format = normalizeTicketCodeFormat(ticketCodeFormat ?? DEFAULT_TICKET_CODE_FORMAT);
  return {
    qrImageSrc: format === "qr" || format === "both" ? `cid:${TICKET_QR_CONTENT_ID}` : null,
    barcodeImageSrc: format === "code128" || format === "both" ? `cid:${TICKET_BARCODE_CONTENT_ID}` : null,
  };
}

async function rasterizeSvg(svg: string, width: number, height: number) {
  return sharp(Buffer.from(svg))
    .resize({
      width,
      height,
      fit: "contain",
      background: "#ffffff",
      withoutEnlargement: false,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function buildTicketCodeEmailAssets(
  scanToken: string,
  ticketCodeFormat?: string | null,
): Promise<TicketCodeEmailAssets> {
  const token = scanToken.trim();
  if (!token) {
    throw new Error("A scan token is required to render ticket email images.");
  }

  const format = normalizeTicketCodeFormat(ticketCodeFormat ?? DEFAULT_TICKET_CODE_FORMAT);
  const imageSources = getTicketCodeEmailImageSources(format);
  const attachments: TicketCodeEmailAttachment[] = [];

  if (format === "qr" || format === "both") {
    const qrPng = await rasterizeSvg(generateQRCode(token).svg, 360, 360);
    attachments.push({
      filename: "ticket-qr.png",
      content: qrPng,
      contentType: "image/png",
      contentId: TICKET_QR_CONTENT_ID,
    });
  }

  if (format === "code128" || format === "both") {
    const barcodePng = await rasterizeSvg(generateCode128(token).svg, 900, 240);
    attachments.push({
      filename: "ticket-barcode.png",
      content: barcodePng,
      contentType: "image/png",
      contentId: TICKET_BARCODE_CONTENT_ID,
    });
  }

  return { attachments, ...imageSources };
}

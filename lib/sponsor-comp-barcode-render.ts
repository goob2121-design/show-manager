import sharp from "sharp";
import { generateCode128 } from "@/lib/reservation-scan-tokens";

export async function renderSponsorCompBarcodePng(token: string) {
  const barcode = generateCode128(token);
  return sharp(Buffer.from(barcode.svg))
    .resize({ width: 1600, withoutEnlargement: false })
    .png()
    .toBuffer();
}

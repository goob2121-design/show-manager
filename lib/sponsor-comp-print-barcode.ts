import { generateCode128, type GeneratedScanAsset } from "./reservation-scan-tokens";

type SponsorCompBarcodeRecord = {
  sponsor_comp_redemption_token?: string | null;
};

export function getSponsorCompPrintBarcode(record?: SponsorCompBarcodeRecord): GeneratedScanAsset | null {
  const token = record?.sponsor_comp_redemption_token?.trim() ?? "";
  if (!token) return null;

  const barcode = generateCode128(token);
  return {
    ...barcode,
    svg: barcode.svg.replace(
      "<svg ",
      '<svg width="100%" height="100%" preserveAspectRatio="none" ',
    ),
  };
}

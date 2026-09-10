import { generateCode128, type GeneratedScanAsset } from "./reservation-scan-tokens";

type SponsorCompBarcodeRecord = {
  sponsor_comp_redemption_token?: string | null;
};

export function getSponsorCompPrintBarcode(record?: SponsorCompBarcodeRecord): GeneratedScanAsset | null {
  const token = record?.sponsor_comp_redemption_token?.trim() ?? "";
  return token ? generateCode128(token) : null;
}

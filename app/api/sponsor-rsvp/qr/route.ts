import QRCode from "qrcode";
import { NextRequest } from "next/server";
import { isValidSponsorCode, normalizeSponsorCode } from "@/lib/sponsor-rsvp";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = normalizeSponsorCode(request.nextUrl.searchParams.get("code"));
  if (!isValidSponsorCode(code)) return new Response("Invalid Sponsor ID", { status: 400 });
  const target = `https://stageflow.cumberlandmountainmusic.com/sponsor-rsvp?code=${encodeURIComponent(code)}`;
  const png = await QRCode.toBuffer(target, { type: "png", width: 420, margin: 2, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
}

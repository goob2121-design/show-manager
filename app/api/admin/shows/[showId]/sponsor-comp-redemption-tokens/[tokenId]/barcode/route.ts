import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { generateCode128 } from "@/lib/reservation-scan-tokens";
import { sponsorCompBarcodeFilename } from "@/lib/sponsor-comp-barcode-download";

export const runtime = "nodejs";
type Context = { params: Promise<{ showId: string; tokenId: string }> };

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Sponsor comp barcode download is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request, context: Context) {
  try {
    const { showId, tokenId } = await context.params;
    const search = new URL(request.url).searchParams;
    const slug = search.get("slug")?.trim() ?? "";
    const showSponsorId = search.get("showSponsorId")?.trim() ?? "";
    const forceDownload = search.get("download") === "1";
    const supabase = createServiceClient();
    const { data: show, error: showError } = await supabase.from("shows").select("id,slug").eq("id", showId).eq("slug", slug).maybeSingle();
    if (showError) throw showError;
    const store = await cookies();
    if (!show || !verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value)) return Response.json({ success: false, error: "Admin access is required." }, { status: 401 });

    const { data: tokenRow, error: tokenError } = await supabase.from("show_sponsor_comp_redemption_tokens")
      .select("id,show_id,show_sponsor_id,token,ordinal,redeemed_at,voided_at")
      .eq("id", tokenId).eq("show_id", showId).eq("show_sponsor_id", showSponsorId).maybeSingle();
    if (tokenError) throw tokenError;
    if (!tokenRow) return Response.json({ success: false, error: "Sponsor redemption barcode was not found." }, { status: 404 });

    const { data: allocation, error: allocationError } = await supabase.from("show_sponsors")
      .select("id,custom_note,sponsor:sponsor_id(name)").eq("id", showSponsorId).eq("show_id", showId).maybeSingle();
    if (allocationError) throw allocationError;
    if (!allocation) return Response.json({ success: false, error: "Sponsor allocation was not found." }, { status: 404 });
    const related = Array.isArray(allocation.sponsor) ? allocation.sponsor[0] : allocation.sponsor;
    const sponsorName = related?.name?.trim() || allocation.custom_note?.trim() || "Sponsor";
    const barcode = generateCode128(tokenRow.token);
    const png = await sharp(Buffer.from(barcode.svg)).resize({ width: 1600, withoutEnlargement: false }).png().toBuffer();
    return new Response(new Uint8Array(png), {
      headers: {
        "content-type": "image/png",
        "content-disposition": `${forceDownload ? "attachment" : "inline"}; filename="${sponsorCompBarcodeFilename(sponsorName, tokenRow.ordinal)}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Unable to download sponsor comp barcode.", error);
    return Response.json({ success: false, error: "Unable to download this sponsor redemption barcode." }, { status: 500 });
  }
}

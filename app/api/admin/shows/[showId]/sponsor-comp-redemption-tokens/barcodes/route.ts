import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { zipSync } from "fflate";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { sponsorCompBarcodeFilename, sponsorCompBarcodeZipFilename } from "@/lib/sponsor-comp-barcode-download";
import { renderSponsorCompBarcodePng } from "@/lib/sponsor-comp-barcode-render";

export const runtime = "nodejs";
type Context = { params: Promise<{ showId: string }> };

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Sponsor comp barcode download is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request, context: Context) {
  try {
    const { showId } = await context.params;
    const search = new URL(request.url).searchParams;
    const slug = search.get("slug")?.trim() ?? "";
    const showSponsorId = search.get("showSponsorId")?.trim() ?? "";
    const supabase = createServiceClient();
    const { data: show, error: showError } = await supabase.from("shows").select("id,slug").eq("id", showId).eq("slug", slug).maybeSingle();
    if (showError) throw showError;
    const store = await cookies();
    if (!show || !showSponsorId || !verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value)) return Response.json({ success: false, error: "Admin access is required." }, { status: 401 });

    const { data: allocation, error: allocationError } = await supabase.from("show_sponsors")
      .select("id,custom_note,sponsor:sponsor_id(name)").eq("id", showSponsorId).eq("show_id", showId).maybeSingle();
    if (allocationError) throw allocationError;
    if (!allocation) return Response.json({ success: false, error: "Sponsor allocation was not found." }, { status: 404 });
    const { data: tokenRows, error: tokenError } = await supabase.from("show_sponsor_comp_redemption_tokens")
      .select("id,token,ordinal,redeemed_at,voided_at").eq("show_id", showId).eq("show_sponsor_id", showSponsorId).order("ordinal", { ascending: true });
    if (tokenError) throw tokenError;
    if (!tokenRows?.length) return Response.json({ success: false, error: "No sponsor redemption barcodes are available." }, { status: 404 });

    const related = Array.isArray(allocation.sponsor) ? allocation.sponsor[0] : allocation.sponsor;
    const sponsorName = related?.name?.trim() || allocation.custom_note?.trim() || "Sponsor";
    const files: Record<string, Uint8Array> = {};
    for (const tokenRow of tokenRows) {
      files[sponsorCompBarcodeFilename(sponsorName, tokenRow.ordinal)] = new Uint8Array(await renderSponsorCompBarcodePng(tokenRow.token));
    }
    return new Response(zipSync(files, { level: 6 }), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${sponsorCompBarcodeZipFilename(sponsorName)}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Unable to download sponsor comp barcode archive.", error);
    return Response.json({ success: false, error: "Unable to download sponsor redemption barcodes." }, { status: 500 });
  }
}

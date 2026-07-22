import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import {
  createServiceRoleSupabaseClient,
  createSquareCatalogPaymentLink,
  getSquareSandboxCatalogConfig,
  listSquareLocations,
} from "@/app/api/integrations/square/_lib";

export const runtime = "nodejs";

type CreateCheckoutLinkRequest = {
  slug?: unknown;
  quantity?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateCheckoutLinkRequest;
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const requestedQuantity = typeof body.quantity === "number" ? body.quantity : Number.parseInt(String(body.quantity ?? "1"), 10);
    const quantity = Number.isFinite(requestedQuantity) && requestedQuantity > 0 ? Math.floor(requestedQuantity) : 1;

    if (!slug) {
      return NextResponse.json({ success: false, error: "Show slug is required." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const hasAdminAccess = verifyAdminSessionCookieValue(slug, cookieStore.get(getAdminSessionCookieName(slug))?.value);
    if (!hasAdminAccess) {
      return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    }

    const { config, missing, invalid } = getSquareSandboxCatalogConfig();
    if (!config) {
      return NextResponse.json({ success: false, error: "Square Sandbox checkout is not configured.", missing, invalid }, { status: 500 });
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data: show, error: showError } = await supabase
      .from("shows")
      .select("id, name, slug, square_catalog_variation_id")
      .eq("slug", slug)
      .maybeSingle();

    if (showError) throw showError;
    const typedShow = show as { id: string; name: string; slug: string; square_catalog_variation_id: string | null } | null;
    const catalogVariationId = typedShow?.square_catalog_variation_id?.trim() ?? "";

    if (!typedShow) {
      return NextResponse.json({ success: false, error: "Show not found." }, { status: 404 });
    }

    if (!catalogVariationId) {
      return NextResponse.json({ success: false, error: "This show does not have a mapped Square catalog variation ID." }, { status: 400 });
    }

    const locations = await listSquareLocations(config);
    const activeLocation = locations.find((location) => location.id && location.status !== "INACTIVE") ?? locations.find((location) => location.id);
    const locationId = activeLocation?.id;

    if (!locationId) {
      return NextResponse.json({ success: false, error: "No Square Sandbox location is available for checkout." }, { status: 400 });
    }

    const paymentLink = await createSquareCatalogPaymentLink(config, {
      idempotencyKey: randomUUID(),
      locationId,
      catalogVariationId,
      quantity,
      description: `StageFlow Sandbox checkout for ${typedShow.name}`,
    });

    if (!paymentLink?.url || !paymentLink.id) {
      return NextResponse.json({ success: false, error: "Square did not return a checkout link." }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      checkout: {
        id: paymentLink.id,
        url: paymentLink.url,
        longUrl: paymentLink.long_url ?? null,
        orderId: paymentLink.order_id ?? null,
        createdAt: paymentLink.created_at ?? new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Square Sandbox checkout link creation failed.", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ success: false, error: "Unable to create Square Sandbox checkout link." }, { status: 500 });
  }
}
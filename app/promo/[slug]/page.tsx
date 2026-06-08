import type { Metadata } from "next";
import { PromoHubPage } from "@/app/components/promo-hub-page";
import { buildPublicPageMetadata, getShowNameBySlug } from "@/lib/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const showName = await getShowNameBySlug(slug);

    return buildPublicPageMetadata({
      title: showName ? `Promo Materials | ${showName}` : "Promo Materials | StageFlow",
      description: showName
        ? `Promo hub for ${showName}. Download flyers, graphics, and shareable links for this show.`
        : "Promo hub for StageFlow. Download flyers, graphics, and shareable links.",
      path: `/promo/${slug}`,
    });
  } catch {
    return buildPublicPageMetadata({
      title: "Promo Materials | StageFlow",
      description: "Promo hub for StageFlow. Download flyers, graphics, and shareable links.",
      path: `/promo/${slug}`,
    });
  }
}

export default async function PromoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <PromoHubPage showSlug={slug} />;
}

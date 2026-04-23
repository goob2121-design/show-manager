import { PromoHubPage } from "@/app/components/promo-hub-page";

export default async function PromoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <PromoHubPage showSlug={slug} />;
}

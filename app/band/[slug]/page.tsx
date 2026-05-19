import type { Metadata } from "next";
import { ShowPage } from "@/app/components/show-page";
import { getShowNameBySlug } from "@/lib/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const showName = await getShowNameBySlug(slug);
    return {
      title: showName ? `Band Portal | ${showName}` : "Band Portal | StageFlow",
    };
  } catch {
    return {
      title: "Band Portal | StageFlow",
    };
  }
}

export default async function BandShowPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <ShowPage showSlug={slug} initialRole="band" showRoleToggle={false} />;
}

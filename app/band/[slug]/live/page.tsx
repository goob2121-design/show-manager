import type { Metadata } from "next";
import { BandLivePage } from "@/app/components/band-live-page";
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
      title: showName ? `Live Mode | ${showName} | StageFlow` : "Live Mode | StageFlow",
    };
  } catch {
    return {
      title: "Live Mode | StageFlow",
    };
  }
}

export default async function BandLiveRoutePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <BandLivePage showSlug={slug} />;
}

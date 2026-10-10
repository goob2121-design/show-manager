import type { Metadata } from "next";
import { LyricWedge } from "@/app/components/lyric-wedge";

export const metadata: Metadata = { title: "Lyric Wedge | StageFlow" };

export default async function LyricWedgeRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LyricWedge key={slug} showSlug={slug} />;
}

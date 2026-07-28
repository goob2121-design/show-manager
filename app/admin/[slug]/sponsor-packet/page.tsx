import type { Metadata } from "next";
import { AdminGate } from "@/app/components/admin-gate";
import { SponsorPacketBuilder } from "@/app/components/sponsor-packet-builder";

export const metadata: Metadata = { title: "Sponsor Packet Builder | StageFlow" };

export default async function SponsorPacketPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <AdminGate slug={slug}><SponsorPacketBuilder showSlug={slug} /></AdminGate>;
}

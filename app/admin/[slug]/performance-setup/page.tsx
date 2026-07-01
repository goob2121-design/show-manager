import type { Metadata } from "next";
import { AdminGate } from "@/app/components/admin-gate";
import { PerformanceSetupPage } from "@/app/components/performance-setup-page";
import { getShowNameBySlug } from "@/lib/route-metadata";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const showName = await getShowNameBySlug(slug);
    return { title: showName ? `${showName} | Performance Setup | StageFlow` : "Performance Setup | StageFlow" };
  } catch {
    return { title: "Performance Setup | StageFlow" };
  }
}

export default async function AdminPerformanceSetupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <AdminGate slug={slug}>
      <PerformanceSetupPage showSlug={slug} />
    </AdminGate>
  );
}
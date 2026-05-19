import type { Metadata } from "next";
import { AdminGate } from "@/app/components/admin-gate";
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
      title: showName ? `${showName} | StageFlow` : "Dashboard | StageFlow",
    };
  } catch {
    return {
      title: "Dashboard | StageFlow",
    };
  }
}

export default async function AdminShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;

  return (
    <AdminGate slug={slug}>
      <ShowPage
        showSlug={slug}
        initialRole="admin"
        initialAdminTab={tab}
        showRoleToggle={false}
      />
    </AdminGate>
  );
}

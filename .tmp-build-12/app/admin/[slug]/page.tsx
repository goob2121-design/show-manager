import { AdminGate } from "@/app/components/admin-gate";
import { ShowPage } from "@/app/components/show-page";

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

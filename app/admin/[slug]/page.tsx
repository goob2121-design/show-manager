import { AdminGate } from "@/app/components/admin-gate";
import { ShowPage } from "@/app/components/show-page";

export default async function AdminShowPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <AdminGate slug={slug}>
      <ShowPage showSlug={slug} initialRole="admin" showRoleToggle={false} />
    </AdminGate>
  );
}

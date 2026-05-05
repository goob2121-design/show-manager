import { ShowPage } from "@/app/components/show-page";

export default async function GuestShowPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <ShowPage showSlug={slug} initialRole="guest" showRoleToggle={false} />;
}

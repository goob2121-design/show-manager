import type { Metadata } from "next";
import { AdminGate } from "@/app/components/admin-gate";
import { EmailCenter } from "@/app/components/email-center";
import { getShowNameBySlug } from "@/lib/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const showName = await getShowNameBySlug(slug).catch(() => null);
  return {
    title: showName ? `Email Center | ${showName} | StageFlow` : "Email Center | StageFlow",
  };
}

export default async function EmailCenterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <AdminGate slug={slug} resourceLabel="Email Center" continueLabel="Continue to Email Center">
      <EmailCenter slug={slug} />
    </AdminGate>
  );
}

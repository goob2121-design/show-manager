import type { Metadata } from "next";
import { AdminGate } from "@/app/components/admin-gate";
import { DoorModePage } from "@/app/components/door-mode-page";
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
      title: showName ? `${showName} | Door Mode | StageFlow` : "Door Mode | StageFlow",
    };
  } catch {
    return {
      title: "Door Mode | StageFlow",
    };
  }
}

export default async function AdminDoorModePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <AdminGate slug={slug}>
      <DoorModePage showSlug={slug} />
    </AdminGate>
  );
}

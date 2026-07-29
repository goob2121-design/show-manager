import type { Metadata } from "next";
import { AdminGate } from "@/app/components/admin-gate";
import { DoorWelcomeDisplay } from "@/app/components/door-welcome-display";

export const metadata: Metadata = { title: "Guest Welcome Display | StageFlow" };

export default async function DoorWelcomeDisplayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <AdminGate slug={slug}><DoorWelcomeDisplay showSlug={slug} /></AdminGate>;
}

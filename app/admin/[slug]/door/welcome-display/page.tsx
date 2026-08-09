import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DoorWelcomeDisplay } from "@/app/components/door-welcome-display";
import { resolveDoorAccess } from "@/lib/door-access";
import { getAdminSessionCookieName } from "@/lib/admin-session";
import { getDoorStaffSessionCookieName } from "@/lib/door-staff-session";

export const metadata: Metadata = { title: "Guest Welcome Display | StageFlow" };

export default async function DoorWelcomeDisplayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await cookies();
  const accessRole = resolveDoorAccess({
    slug,
    adminCookieValue: store.get(getAdminSessionCookieName(slug))?.value,
    doorStaffCookieValue: store.get(getDoorStaffSessionCookieName(slug))?.value,
  });
  if (!accessRole) redirect(`/admin/${slug}/door/login`);
  return <DoorWelcomeDisplay showSlug={slug} />;
}

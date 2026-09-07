import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PersonnelDirectoryPage } from "@/app/components/personnel-directory-page";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";

export default async function PersonnelDirectoryRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await cookies();
  if (!verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value)) redirect(`/admin/${encodeURIComponent(slug)}/door/login`);
  return <PersonnelDirectoryPage showSlug={slug} />;
}

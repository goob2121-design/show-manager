import type { Metadata } from "next";
import { AdminGate } from "@/app/components/admin-gate";
import { ShowPage } from "@/app/components/show-page";
import { getSquareConfig } from "@/app/api/integrations/square/_lib";
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
  const squareConfigResult = getSquareConfig();
  const squareEnvironment = process.env.SQUARE_ENVIRONMENT?.trim().toLowerCase();
  const normalizedSquareEnvironment =
    squareEnvironment === "sandbox" || squareEnvironment === "production"
      ? squareEnvironment
      : null;
  const webhookConfigured =
    normalizedSquareEnvironment !== null &&
    !squareConfigResult.missing.some(
      (variableName) =>
        variableName.endsWith("_SIGNATURE_KEY") ||
        variableName.endsWith("_WEBHOOK_NOTIFICATION_URL"),
    ) &&
    squareConfigResult.invalid.length === 0;

  return (
    <AdminGate slug={slug}>
      <ShowPage
        showSlug={slug}
        initialRole="admin"
        initialAdminTab={tab}
        showRoleToggle={false}
        squareAdminStatus={{
          environment: normalizedSquareEnvironment,
          webhookConfigured,
          configurationValid:
            squareConfigResult.missing.length === 0 &&
            squareConfigResult.invalid.length === 0,
        }}
      />
    </AdminGate>
  );
}

import type { Metadata } from "next";
import { AdminGate } from "@/app/components/admin-gate";
import { R2TestPage } from "@/app/components/r2-test-page";
import { getR2TestConfigSummary } from "@/lib/r2-storage";

export const metadata: Metadata = {
  title: "R2 Test | StageFlow",
};

export const dynamic = "force-dynamic";

export default function R2AdminTestRoute() {
  let configSummary = null;
  let configError: string | null = null;

  try {
    configSummary = getR2TestConfigSummary();
  } catch (error) {
    configError = error instanceof Error ? error.message : "R2 environment variables are not configured yet.";
  }

  return (
    <AdminGate
      slug="shows-dashboard"
      resourceLabel="the R2 test page"
      continueLabel="Continue to R2 Test"
    >
      <R2TestPage configSummary={configSummary} configError={configError} />
    </AdminGate>
  );
}

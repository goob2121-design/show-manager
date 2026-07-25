import type { SupabaseClient } from "@supabase/supabase-js";

export type PrepareCheckInListStatus =
  | "added"
  | "already_present"
  | "already_handled"
  | "skipped"
  | "error";

export type PrepareCheckInListDetail = {
  sourceType: string;
  maskedSourceIdentity: string;
  displayLabel: string;
  admissionType: string;
  destination: string;
  status: PrepareCheckInListStatus;
  reason?: string;
};

export type PrepareCheckInListResult = {
  added: number;
  alreadyPresent: number;
  alreadyHandled: number;
  skipped: number;
  errors: number;
  details: PrepareCheckInListDetail[];
};

type PrepareRpcRow = {
  source_type: string;
  source_id: string;
  display_label: string;
  admission_type: string;
  destination: string;
  result_status: PrepareCheckInListStatus;
  reason: string | null;
};

function cleanText(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

export function maskProjectionSource(sourceType: string, sourceId: string) {
  const identity = `${sourceType}:${sourceId}`;
  if (identity.length <= 24) return identity;
  return `${sourceType}:${sourceId.slice(0, 4)}...${sourceId.slice(-4)}`;
}

export function normalizePrepareCheckInListRows(rows: PrepareRpcRow[]): PrepareCheckInListResult {
  const allowedStatuses = new Set<PrepareCheckInListStatus>([
    "added",
    "already_present",
    "already_handled",
    "skipped",
    "error",
  ]);
  const details = rows.map((row): PrepareCheckInListDetail => {
    const status = allowedStatuses.has(row.result_status) ? row.result_status : "error";
    return {
      sourceType: cleanText(row.source_type, "unknown"),
      maskedSourceIdentity: maskProjectionSource(
        cleanText(row.source_type, "unknown"),
        cleanText(row.source_id, "unknown"),
      ),
      displayLabel: cleanText(row.display_label, "Unnamed Admission"),
      admissionType: cleanText(row.admission_type, "Admission"),
      destination: cleanText(row.destination, "Needs Review"),
      status,
      reason: row.reason ? cleanText(row.reason, "No additional detail.") : undefined,
    };
  });

  return {
    added: details.filter((item) => item.status === "added").length,
    alreadyPresent: details.filter((item) => item.status === "already_present").length,
    alreadyHandled: details.filter((item) => item.status === "already_handled").length,
    skipped: details.filter((item) => item.status === "skipped").length,
    errors: details.filter((item) => item.status === "error").length,
    details,
  };
}

export async function prepareCheckInList(
  supabase: SupabaseClient,
  showId: string,
  showSlug: string,
) {
  const { data, error } = await supabase.rpc("prepare_show_check_in_list", {
    p_show_id: showId,
    p_show_slug: showSlug,
  });
  if (error) throw error;
  return normalizePrepareCheckInListRows((data ?? []) as PrepareRpcRow[]);
}

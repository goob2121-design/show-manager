import type { SupabaseClient } from "@supabase/supabase-js";

export type AdmissionsPreviewSourceType =
  | "ticket"
  | "reserved_link"
  | "reserved_assignment"
  | "show_sponsor";

export type AdmissionsPreviewClassification =
  | "already_present_in_check_in"
  | "paid_reserved_link_missing_projection"
  | "complimentary_reserved_link_missing_projection"
  | "guest_comp"
  | "band_comp"
  | "media_comp"
  | "volunteer_comp"
  | "staff_comp"
  | "other_comp"
  | "sponsor_admission_native_check_in"
  | "ambiguous_source_ownership";

export type AdmissionsPreviewStatus = "would_add" | "already_present" | "skipped" | "error";

export type AdmissionsPreviewDetail = {
  sourceType: AdmissionsPreviewSourceType;
  maskedSourceIdentity: string;
  displayLabel: string;
  quantity: number | null;
  classification: AdmissionsPreviewClassification;
  status: AdmissionsPreviewStatus;
  reason: string;
};

export type AdmissionsSyncPreviewResult = {
  showId: string;
  generatedAt: string;
  counts: {
    wouldAdd: number;
    alreadyPresent: number;
    skipped: number;
    errors: number;
  };
  details: AdmissionsPreviewDetail[];
};

type PreviewTicket = {
  id: string;
  guest_name: string | null;
  ticket_count: number | string | null;
  ticket_type: string | null;
  external_source: string | null;
};

type PreviewReservedLink = {
  id: string;
  customer_name: string | null;
  ticket_count: number | string | null;
  source_ticket_id: string | null;
  selection_mode: string;
  is_complimentary: boolean;
  source_note: string | null;
  seat_category: string;
};

type PreviewReservedAssignment = {
  id: string;
  seating_link_id: string | null;
  assignment_type: string;
  seat_category: string | null;
  notes: string | null;
};

type PreviewSponsor = {
  id: string;
  comp_ticket_allowance: number | string | null;
  sponsor: { name: string | null } | Array<{ name: string | null }> | null;
};

export type AdmissionsPreviewData = {
  showId: string;
  tickets: PreviewTicket[];
  reservedLinks: PreviewReservedLink[];
  reservedAssignments: PreviewReservedAssignment[];
  sponsors: PreviewSponsor[];
};

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function usefulHumanLabel(value: string | null | undefined) {
  const cleaned = value
    ?.replace(/\[(?:comp|admission) type:\s*[^\]]+\]/gi, "")
    .replace(/^[\s:;|,-]+|[\s:;|,-]+$/g, "")
    .trim();
  return cleaned || null;
}

function quantity(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function categoryLabel(classification: AdmissionsPreviewClassification) {
  if (classification === "band_comp") return "Band Comp";
  if (classification === "guest_comp") return "Guest Comp";
  if (classification === "media_comp") return "Media Comp";
  if (classification === "volunteer_comp") return "Volunteer Comp";
  if (classification === "staff_comp") return "Staff Comp";
  if (classification === "other_comp") return "Other Comp";
  return null;
}

function decorateAdmissionLabel(label: string, classification: AdmissionsPreviewClassification) {
  const category = categoryLabel(classification);
  if (!category || normalized(label).includes(normalized(category))) return label;
  return `${category} - ${label}`;
}

function sponsorName(sponsor: PreviewSponsor) {
  const record = Array.isArray(sponsor.sponsor) ? sponsor.sponsor[0] : sponsor.sponsor;
  return usefulHumanLabel(record?.name) ?? "Unnamed Sponsor";
}
function maskIdentifier(value: string) {
  const [prefix, rawId = ""] = value.split(":", 2);
  if (rawId.length <= 8) return `${prefix}:${rawId.slice(0, 2)}...${rawId.slice(-2)}`;
  return `${prefix}:${rawId.slice(0, 4)}...${rawId.slice(-4)}`;
}

function detail(
  sourceType: AdmissionsPreviewSourceType,
  sourceId: string,
  displayLabel: string,
  quantity: number | null,
  classification: AdmissionsPreviewClassification,
  status: AdmissionsPreviewStatus,
  reason: string,
): AdmissionsPreviewDetail {
  return {
    sourceType,
    maskedSourceIdentity: maskIdentifier(`${sourceType}:${sourceId}`),
    displayLabel,
    quantity,
    classification,
    status,
    reason,
  };
}

function classifyCompText(value: string | null | undefined): AdmissionsPreviewClassification {
  const text = normalized(value);
  const marker = text.match(/\[comp type:\s*(band|guest|media|volunteer|staff|other)\]/)?.[1];
  const category = marker
    ?? (text.includes("band") ? "band"
      : text.includes("media") || text.includes("press") ? "media"
        : text.includes("volunteer") ? "volunteer"
          : text.includes("staff") ? "staff"
            : text.includes("guest") ? "guest"
              : "other");

  switch (category) {
    case "band": return "band_comp";
    case "media": return "media_comp";
    case "volunteer": return "volunteer_comp";
    case "staff": return "staff_comp";
    case "guest": return "guest_comp";
    default: return "other_comp";
  }
}

function classifyReservedLink(link: PreviewReservedLink): AdmissionsPreviewClassification {
  if (!link.is_complimentary && normalized(link.seat_category) === "paid_reserved") {
    return "paid_reserved_link_missing_projection";
  }
  if (normalized(link.seat_category) === "guest") return "guest_comp";
  const compClassification = classifyCompText(link.source_note);
  const hasExplicitCompCategory = /\[comp type:\s*(band|guest|media|volunteer|staff|other)\]/i.test(link.source_note ?? "");
  return compClassification === "other_comp" && !hasExplicitCompCategory
    ? "complimentary_reserved_link_missing_projection"
    : compClassification;
}

function classifyUnlinkedAssignment(assignment: PreviewReservedAssignment): AdmissionsPreviewClassification {
  if (normalized(assignment.seat_category) === "paid_reserved") {
    return "paid_reserved_link_missing_projection";
  }
  if (normalized(assignment.seat_category) === "guest") return "guest_comp";
  return classifyCompText(assignment.notes);
}

export function buildAdmissionsSyncPreview(
  data: AdmissionsPreviewData,
  generatedAt = new Date().toISOString(),
): AdmissionsSyncPreviewResult {
  const details: AdmissionsPreviewDetail[] = [];
  const ticketById = new Map(data.tickets.map((ticket) => [ticket.id, ticket]));
  const ticketIds = new Set(ticketById.keys());
  const linkIds = new Set(data.reservedLinks.map((link) => link.id));

  for (const ticket of data.tickets) {
    details.push(detail(
      "ticket",
      ticket.id,
      usefulHumanLabel(ticket.guest_name) ?? "Unnamed Ticket Entry",
      quantity(ticket.ticket_count),
      "already_present_in_check_in",
      "already_present",
      ticket.external_source === "square"
        ? "Square-imported ticket is already present in check-in and will not be modified."
        : "Ticket is already present in the check-in table.",
    ));
  }

  for (const link of data.reservedLinks) {
    const linkAdmissionClassification = classifyReservedLink(link);
    const linkedTicket = link.source_ticket_id ? ticketById.get(link.source_ticket_id) : null;
    const linkBaseLabel = usefulHumanLabel(link.customer_name)
      ?? usefulHumanLabel(linkedTicket?.guest_name)
      ?? usefulHumanLabel(link.source_note)
      ?? "Unnamed Reserved Admission";
    const linkDisplayLabel = decorateAdmissionLabel(linkBaseLabel, linkAdmissionClassification);
    if (link.source_ticket_id) {
      if (ticketIds.has(link.source_ticket_id)) {
        details.push(detail(
          "reserved_link",
          link.id,
          linkDisplayLabel,
          quantity(link.ticket_count),
          "already_present_in_check_in",
          "already_present",
          "Existing source ticket already points to a check-in row; no projection is needed.",
        ));
      } else {
        details.push(detail(
          "reserved_link",
          link.id,
          linkDisplayLabel,
          quantity(link.ticket_count),
          "ambiguous_source_ownership",
          "skipped",
          "Source ownership references a ticket that is not available for this show.",
        ));
      }
      continue;
    }

    details.push(detail(
      "reserved_link",
      link.id,
      linkDisplayLabel,
      quantity(link.ticket_count),
      linkAdmissionClassification,
      "would_add",
      "Reserved admission has no source ticket and would receive a check-in projection.",
    ));
  }

  for (const assignment of data.reservedAssignments) {
    if (assignment.assignment_type !== "customer") continue;
    if (assignment.seating_link_id) {
      if (!linkIds.has(assignment.seating_link_id)) {
        details.push(detail(
          "reserved_assignment",
          assignment.id,
          usefulHumanLabel(assignment.notes) ?? "Unnamed Reserved Assignment",
          1,
          "ambiguous_source_ownership",
          "skipped",
          "Assignment references a reserved link that is not available for this show.",
        ));
      }
      continue;
    }

    const assignmentClassification = classifyUnlinkedAssignment(assignment);
    const assignmentLabel = decorateAdmissionLabel(
      usefulHumanLabel(assignment.notes) ?? "Unnamed Reserved Assignment",
      assignmentClassification,
    );
    details.push(detail(
      "reserved_assignment",
      assignment.id,
      assignmentLabel,
      1,
      assignmentClassification,
      "would_add",
      "Customer assignment has no reserved link and would receive its own check-in projection.",
    ));
  }

  for (const sponsor of data.sponsors) {
    if (Number(sponsor.comp_ticket_allowance) <= 0) continue;
    details.push(detail(
      "show_sponsor",
      sponsor.id,
      sponsorName(sponsor),
      quantity(sponsor.comp_ticket_allowance),
      "sponsor_admission_native_check_in",
      "already_present",
      "Sponsor allowance is already handled by the native sponsor check-in counter.",
    ));
  }

  return {
    showId: data.showId,
    generatedAt,
    counts: {
      wouldAdd: details.filter((item) => item.status === "would_add").length,
      alreadyPresent: details.filter((item) => item.status === "already_present").length,
      skipped: details.filter((item) => item.status === "skipped").length,
      errors: details.filter((item) => item.status === "error").length,
    },
    details,
  };
}

export async function loadAdmissionsSyncPreview(
  supabase: SupabaseClient,
  showId: string,
  showSlug: string,
  generatedAt?: string,
) {
  const { data: show, error: showError } = await supabase
    .from("shows")
    .select("id")
    .eq("id", showId)
    .eq("slug", showSlug)
    .maybeSingle();
  if (showError) throw showError;
  if (!show) throw new Error("Show not found.");

  const [ticketsResult, linksResult, assignmentsResult, sponsorsResult] = await Promise.all([
    supabase
      .from("show_comp_tickets")
      .select("id, guest_name, ticket_count, ticket_type, external_source")
      .eq("show_id", showId)
      .order("created_at", { ascending: true }),
    supabase
      .from("show_reserved_seating_links")
      .select("id, customer_name, ticket_count, source_ticket_id, selection_mode, is_complimentary, source_note, seat_category")
      .eq("show_id", showId)
      .order("created_at", { ascending: true }),
    supabase
      .from("show_reserved_seat_assignments")
      .select("id, seating_link_id, assignment_type, seat_category, notes")
      .eq("show_id", showId)
      .order("created_at", { ascending: true }),
    supabase
      .from("show_sponsors")
      .select("id, comp_ticket_allowance, sponsor:sponsor_library(name)")
      .eq("show_id", showId)
      .order("created_at", { ascending: true }),
  ]);

  if (ticketsResult.error) throw ticketsResult.error;
  if (linksResult.error) throw linksResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;
  if (sponsorsResult.error) throw sponsorsResult.error;

  return buildAdmissionsSyncPreview({
    showId,
    tickets: (ticketsResult.data ?? []) as PreviewTicket[],
    reservedLinks: (linksResult.data ?? []) as PreviewReservedLink[],
    reservedAssignments: (assignmentsResult.data ?? []) as PreviewReservedAssignment[],
    sponsors: (sponsorsResult.data ?? []) as PreviewSponsor[],
  }, generatedAt);
}

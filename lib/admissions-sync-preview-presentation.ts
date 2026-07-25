import type {
  AdmissionsPreviewDetail,
  AdmissionsPreviewDestinationGroup,
} from "./admissions-sync-preview";

export const CHECK_IN_PREVIEW_READ_ONLY_TITLE = "READ-ONLY PREVIEW";
export const CHECK_IN_PREVIEW_READ_ONLY_MESSAGE = "Nothing on this screen will be changed.";

export type CheckInPreviewFilter =
  | "all"
  | "prepaid_online"
  | "special_admissions"
  | "sponsor_native"
  | "door_sale_native"
  | "needs_review";

export type CheckInPreviewHumanStatus =
  | "ready_to_add"
  | "already_present"
  | "already_handled"
  | "needs_review"
  | "error";

export const CHECK_IN_PREVIEW_FILTERS: Array<{ value: CheckInPreviewFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "prepaid_online", label: "Prepaid / Online" },
  { value: "special_admissions", label: "Special Admissions" },
  { value: "sponsor_native", label: "Sponsor Check-In" },
  { value: "door_sale_native", label: "Paid Door" },
  { value: "needs_review", label: "Needs Review" },
];

export function destinationLabel(value: AdmissionsPreviewDestinationGroup) {
  if (value === "prepaid_online") return "Prepaid / Online Check-In";
  if (value === "special_admissions") return "Special Admissions";
  if (value === "sponsor_native") return "Sponsor Comp Check-In";
  if (value === "door_sale_native") return "Paid Door";
  return "Needs Review";
}

export function humanStatus(item: AdmissionsPreviewDetail): CheckInPreviewHumanStatus {
  if (item.status === "error") return "error";
  if (item.destinationGroup === "needs_review" || item.status === "skipped") return "needs_review";
  if (item.destinationGroup === "sponsor_native" || item.destinationGroup === "door_sale_native") {
    return "already_handled";
  }
  if (item.status === "would_add") return "ready_to_add";
  return "already_present";
}

export function humanStatusLabel(value: CheckInPreviewHumanStatus) {
  if (value === "ready_to_add") return "Ready to Add";
  if (value === "already_present") return "Already Present";
  if (value === "already_handled") return "Already Handled";
  if (value === "needs_review") return "Needs Review";
  return "Error";
}

export function filterPreviewDetails(details: AdmissionsPreviewDetail[], filter: CheckInPreviewFilter) {
  return filter === "all" ? details : details.filter((item) => item.destinationGroup === filter);
}

export function sumPreviewQuantity(details: AdmissionsPreviewDetail[]) {
  return details.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

export function buildDestinationTotals(details: AdmissionsPreviewDetail[]) {
  const totalFor = (destination: AdmissionsPreviewDestinationGroup) =>
    sumPreviewQuantity(details.filter((item) => item.destinationGroup === destination));

  return {
    prepaidOnline: totalFor("prepaid_online"),
    specialAdmissions: totalFor("special_admissions"),
    sponsorNative: totalFor("sponsor_native"),
    paidDoorNative: totalFor("door_sale_native"),
    needsReview: totalFor("needs_review"),
  };
}

export function buildActionTotals(details: AdmissionsPreviewDetail[]) {
  const count = (status: CheckInPreviewHumanStatus) =>
    details.filter((item) => humanStatus(item) === status).length;

  return {
    readyToAdd: count("ready_to_add"),
    alreadyPresent: count("already_present"),
    alreadyHandled: count("already_handled"),
    needsReview: count("needs_review"),
    errors: count("error"),
  };
}

import type { SponsorLibraryEntry } from "@/lib/types";

export const SPONSOR_CONTACT_METHODS = ["email", "phone", "text", "none"] as const;
export type SponsorContactMethod = (typeof SPONSOR_CONTACT_METHODS)[number];

export function sponsorRecognitionName(
  sponsor: Pick<SponsorLibraryEntry, "name" | "recognition_name" | "legal_name">,
) {
  return sponsor.recognition_name?.trim() || sponsor.name.trim() || sponsor.legal_name?.trim() || "Sponsor";
}

export function sponsorLocation(
  sponsor: Pick<SponsorLibraryEntry, "city" | "state">,
) {
  return [sponsor.city?.trim(), sponsor.state?.trim()].filter(Boolean).join(", ");
}

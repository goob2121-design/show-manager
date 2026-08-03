export const SPONSOR_CODE_PATTERN = /^[A-HJ-NP-Z]{2}\d{2}$/;
export const SPONSOR_CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export type SponsorRsvpStatus = "pending" | "attending" | "not_attending";

export type SponsorShowRsvp = {
  id: string;
  sponsor_id: string;
  show_id: string;
  status: SponsorRsvpStatus;
  guest_count: number | null;
  note: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeSponsorCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function isValidSponsorCode(value: unknown) {
  return SPONSOR_CODE_PATTERN.test(normalizeSponsorCode(value));
}

export function generateSponsorCode(random: () => number = Math.random) {
  const letter = () => SPONSOR_CODE_LETTERS[Math.floor(random() * SPONSOR_CODE_LETTERS.length) % SPONSOR_CODE_LETTERS.length];
  const digits = Math.floor(random() * 100) % 100;
  return `${letter()}${letter()}${digits.toString().padStart(2, "0")}`;
}

export async function generateUniqueSponsorCode(
  exists: (code: string) => Promise<boolean>,
  random: () => number = Math.random,
  maxAttempts = 100,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateSponsorCode(random);
    if (!(await exists(code))) return code;
  }
  throw new Error("Unable to generate a unique Sponsor ID.");
}

export function summarizeSponsorRsvps(rows: Array<Pick<SponsorShowRsvp, "status" | "guest_count">>) {
  return rows.reduce(
    (summary, row) => {
      if (row.status === "attending") {
        summary.attending += 1;
        summary.totalGuests += Math.max(0, row.guest_count ?? 0);
      } else if (row.status === "not_attending") summary.notAttending += 1;
      else summary.pending += 1;
      return summary;
    },
    { attending: 0, totalGuests: 0, notAttending: 0, pending: 0 },
  );
}

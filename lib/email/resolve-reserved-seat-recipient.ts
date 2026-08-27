import type { SupabaseClient } from "@supabase/supabase-js";

export type ReservedSeatRecipientSource = {
  showId: string;
  customerName: string;
  email: string | null;
  sourceTicketId: string | null;
  sourceShowSponsorId: string | null;
  isComplimentary: boolean;
  seatCategory: string | null;
};

type SponsorContact = {
  name?: string | null;
  recognition_name?: string | null;
  email?: string | null;
};

type ShowSponsorContact = {
  id: string;
  custom_note?: string | null;
  sponsor?: SponsorContact | SponsorContact[] | null;
};

function cleanEmail(value: string | null | undefined) {
  return value?.trim() || null;
}

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalizedName(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() || "";
}

export function selectReservedSeatRecipientEmail(input: {
  reservedSeatEmail?: string | null;
  compTicketEmail?: string | null;
  sponsorLibraryEmail?: string | null;
}) {
  return cleanEmail(input.reservedSeatEmail)
    ?? cleanEmail(input.compTicketEmail)
    ?? cleanEmail(input.sponsorLibraryEmail);
}

function sponsorMatchesCustomerName(row: ShowSponsorContact, customerName: string) {
  const sponsor = one(row.sponsor);
  const target = normalizedName(customerName);
  if (!target) return false;
  return [sponsor?.name, sponsor?.recognition_name, row.custom_note]
    .some((value) => normalizedName(value) === target);
}

async function loadSponsorContactEmail(supabase: SupabaseClient, showSponsorId: string) {
  const { data, error } = await supabase
    .from("show_sponsors")
    .select("id,sponsor:sponsor_id(email)")
    .eq("id", showSponsorId)
    .maybeSingle();
  if (error) throw error;
  return cleanEmail(one((data as ShowSponsorContact | null)?.sponsor)?.email);
}

export async function resolveReservedSeatRecipientEmail(
  supabase: SupabaseClient,
  source: ReservedSeatRecipientSource,
) {
  const explicitReservedSeatEmail = cleanEmail(source.email);
  if (explicitReservedSeatEmail) return explicitReservedSeatEmail;

  let compTicketEmail: string | null = null;
  if (source.sourceTicketId) {
    const { data, error } = await supabase
      .from("show_comp_tickets")
      .select("email")
      .eq("id", source.sourceTicketId)
      .eq("show_id", source.showId)
      .maybeSingle();
    if (error) throw error;
    compTicketEmail = cleanEmail(data?.email);
  }
  if (compTicketEmail) return compTicketEmail;

  if (source.sourceShowSponsorId) {
    return loadSponsorContactEmail(supabase, source.sourceShowSponsorId);
  }

  // Legacy sponsor-comp links created before source_show_sponsor_id existed can
  // be resolved only when one exact show-sponsor name match is unambiguous.
  const { data, error } = await supabase
    .from("show_sponsors")
    .select("id,custom_note,sponsor:sponsor_id(name,recognition_name,email)")
    .eq("show_id", source.showId);
  if (error) throw error;
  const matches = ((data ?? []) as ShowSponsorContact[])
    .filter((row) => sponsorMatchesCustomerName(row, source.customerName));
  if (matches.length !== 1) return null;
  return cleanEmail(one(matches[0].sponsor)?.email);
}
